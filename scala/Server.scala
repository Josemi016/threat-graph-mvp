import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.model._
import akka.http.scaladsl.server.Directives.{ get => httpGet, _ }
import akka.http.scaladsl.server.Route
import akka.stream.Materializer
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._

import spray.json._

import org.apache.spark.sql.{DataFrame, SparkSession}
import org.apache.spark.sql.functions._
import org.apache.spark.graphx._
import org.apache.spark.rdd.RDD

import scala.concurrent.{ExecutionContext, Future}
import scala.io.StdIn

// -----------------------------
// JSON payload models
// -----------------------------
final case class NodeJson(
                           id: String,
                           label: String,
                           t: String,
                           pr_percent: Double,
                           pr_temporal_percent: Double
                         )
final case class EdgeJson(src: String, dst: String)
final case class GraphPayload(nodes: Seq[NodeJson], edges: Seq[EdgeJson])
final case class Status(ok: Boolean)

trait JsonProtocol extends DefaultJsonProtocol {
  implicit val nodeFmt = jsonFormat5(NodeJson)
  implicit val edgeFmt = jsonFormat2(EdgeJson)
  implicit val paylFmt = jsonFormat2(GraphPayload)
  implicit val statFmt = jsonFormat1(Status)
}

// -----------------------------
// Spark + GraphX job
// -----------------------------
object GraphJob {
  private case class VAttr(t: String, label: String)

  /**
   * Computes the graph metrics and returns a serializable payload for the UI.
   *
   * Input files are expected to be CSV with headers:
   *  - vertices.csv: id, type, label, last_seen
   *  - aristas.csv : src, dst
   *
   * @param spark active SparkSession
   * @param verticesPath path to vertices CSV
   * @param edgesPath path to edges CSV
   * @param halfLifeDays half-life (days) for temporal PageRank decay
   */
  def computeGraph(
                    spark: SparkSession,
                    verticesPath: String,
                    edgesPath: String,
                    halfLifeDays: Double = 30.0
                  )(implicit ec: ExecutionContext): GraphPayload = {

    import spark.implicits._
    spark.sparkContext.setLogLevel("WARN")

    // Load vertices
    val verticesRaw = spark.read.option("header", "true").csv(verticesPath)
    val vDF = verticesRaw
      .select(
        col("id"),
        col("type").as("t"),
        col("label"),
        when(col("last_seen").isNotNull, col("last_seen")).as("last_seen")
      )
      .cache()

    // Load edges
    val eDF = spark.read.option("header", "true").csv(edgesPath)
      .select($"src", $"dst")
      .cache()

    // Map string id -> long VertexId
    val allIds = vDF.select($"id")
      .union(eDF.select($"src".as("id")))
      .union(eDF.select($"dst".as("id")))
      .distinct()

    val idMap = allIds.as[String].rdd.distinct().zipWithUniqueId().toDF("id", "vid")
    val vIdx  = vDF.join(idMap, Seq("id")).select($"vid".as("vid"), $"t", $"label")
    val eIdx  = eDF
      .join(idMap.withColumnRenamed("id", "src").withColumnRenamed("vid", "srcId"), Seq("src"))
      .join(idMap.withColumnRenamed("id", "dst").withColumnRenamed("vid", "dstId"), Seq("dst"))
      .select($"srcId", $"dstId")

    val verticesRDD: RDD[(VertexId, VAttr)] =
      vIdx.rdd.map(r => (r.getAs[Long]("vid"), VAttr(r.getAs[String]("t"), r.getAs[String]("label"))))

    val edgesRDD: RDD[Edge[Int]] =
      eIdx.rdd.map(r => Edge(r.getAs[Long]("srcId"), r.getAs[Long]("dstId"), 1))

    val graph: Graph[VAttr, Int] = Graph(verticesRDD, edgesRDD).cache()

    // Static PageRank (10 iterations)
    val prGraph = graph.staticPageRank(10)
    val ranks   = prGraph.vertices.join(graph.vertices) // (vid, (pr, VAttr))

    val resultsDF = ranks
      .map { case (_, (pr, attr)) => (pr, attr.t, attr.label) }
      .toDF("pagerank", "t", "label")
      .orderBy(desc("pagerank"))
      .cache()

    val total = resultsDF.agg(sum("pagerank")).as[Double].first()

    val prCols = resultsDF
      .withColumn("pr_percent", round((col("pagerank") / lit(total)) * 100.0, 6))
      .select($"label", $"t", $"pagerank", $"pr_percent")

    // Temporal PageRank: optional last_seen with exponential decay by half-life
    val withSeen = prCols.join(vDF.select("label", "last_seen"), Seq("label"), "left")

    val withAge = withSeen.withColumn(
      "age_days",
      when(col("last_seen").isNotNull,
        datediff(current_date(), to_date(col("last_seen"))).cast("double")
      ).otherwise(lit(null).cast("double"))
    )

    val withRecency = withAge.withColumn(
      "recency_weight",
      when(col("age_days").isNotNull,
        pow(lit(0.5), col("age_days") / lit(halfLifeDays))
      ).otherwise(lit(1.0))
    )

    val withTemporal = withRecency.withColumn(
      "pagerank_temporal", col("pagerank") * col("recency_weight")
    )

    val totalTemporal = withTemporal.agg(sum("pagerank_temporal")).as[Double].first()

    val temporalCols = withTemporal
      .withColumn("pr_temporal_percent",
        round((col("pagerank_temporal") / lit(totalTemporal)) * 100.0, 6)
      )
      .select($"label", $"pr_temporal_percent")

    // Nodes: join metrics back (by unique label)
    val nodesDF = vDF
      .select($"id", $"label", $"t")
      .join(prCols.select("label", "pr_percent"), Seq("label"), "left")
      .join(temporalCols, Seq("label"), "left")
      .na.fill(0.0, Seq("pr_percent", "pr_temporal_percent"))
      .cache()

    // Ensure edges refer to existing node ids
    val nodeIds = nodesDF.select($"id").as[String]
    val edgesFiltered = eDF
      .join(nodeIds.toDF("src").distinct, Seq("src"))
      .join(nodeIds.toDF("dst").distinct, Seq("dst"))
      .select($"src", $"dst")
      .cache()

    // Collect to JSON-friendly payload
    val nodes = nodesDF
      .select("id", "label", "t", "pr_percent", "pr_temporal_percent")
      .as[(String, String, String, Double, Double)]
      .collect()
      .toSeq
      .map { case (id, label, t, pr, prt) =>
        NodeJson(id = id, label = label, t = t, pr_percent = pr, pr_temporal_percent = prt)
      }

    val edges = edgesFiltered
      .as[(String, String)]
      .collect()
      .toSeq
      .map { case (s, d) => EdgeJson(src = s, dst = d) }

    GraphPayload(nodes, edges)
  }
}

// -----------------------------
// HTTP server
// -----------------------------
object Server extends JsonProtocol {
  @volatile private var cache: Option[GraphPayload] = None

  def main(args: Array[String]): Unit = {
    implicit val system: ActorSystem  = ActorSystem("threat-graph-api")
    implicit val mat: Materializer    = Materializer(system)
    implicit val ec: ExecutionContext = system.dispatcher

    // Single Spark session for the whole server
    val spark = SparkSession.builder()
      .appName("ThreatGraph-MVP")
      .master(sys.props.getOrElse("spark.master", "local[*]"))
      .getOrCreate()

    sys.addShutdownHook {
      try spark.stop() catch { case _: Throwable => () }
      system.terminate()
    }

    // --- API ---
    val apiRoutes: Route = pathPrefix("api") {
      // POST /api/generate -> run Spark and cache the result
      path("generate") {
        post {
          val verticesPath = "data/vertices.csv"
          val edgesPath    = "data/aristas.csv"
          complete {
            Future {
              val payload = GraphJob.computeGraph(spark, verticesPath, edgesPath)
              cache = Some(payload)
              Status(ok = true)
            }
          }
        }
      } ~
        // GET /api/graph -> return last generated graph
        path("graph") {
          httpGet {  // ⬅️ usamos la directiva get de Akka con alias
            cache match {
              case Some(p) => complete(p)
              case None    => complete(StatusCodes.NotFound -> "Graph not generated yet. POST /api/generate first.")
            }
          }
        }
    }

    // --- Static files (frontend under resources/web) ---
    val staticRoutes: Route =
      pathEndOrSingleSlash {
        getFromResource("web/index.html")
      } ~
        getFromResourceDirectory("web")

    // --- Mount all routes ---
    val routes: Route = apiRoutes ~ staticRoutes

    Http().newServerAt("0.0.0.0", 9000).bind(routes)
    println("Server started: http://localhost:9000  (POST /api/generate, GET /api/graph)")
  }
}
