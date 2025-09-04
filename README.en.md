### 📖 Available languages  
- 🇪🇸 [Español](README.md) 


# Threat-graph
![MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Scala](https://img.shields.io/badge/Scala-2.12%2B-red)
![Spark](https://img.shields.io/badge/Spark-3.x-orange)
![D3.js](https://img.shields.io/badge/D3.js-v7-blue)
![Status](https://img.shields.io/badge/Live-Demo-success)

**Threat Graph** is an interactive application to visualize relationships between **IPs, domains, certificates, and hashes** in a dynamic graph.  
This project integrates **Spark + GraphX (backend)** and **D3.js (frontend)** to build a prototype for cyber threat analysis.

> 🔗 **Demo:** https://josemi016.github.io/threat-graph-mvp/
---

## 📸 Screenshots

### Generated graph
<img width="1919" height="937" alt="image" src="https://github.com/user-attachments/assets/baaf23af-d3ee-464b-b157-b8c02dfe32e2" />

---

## ✨ Key Features

- 📊 **Interactive visualization** with [D3.js](https://d3js.org/).
- 🟦 Node colors by type:
  - Blue: **Domains**
  - Light Blue: **IPs**
  - Orange: **Certificates**
  - Red: **Hashes**
- 🔍 **Node search** (by ID or label).
- 🖱️ **Side panel** showing details of the selected node and its neighbors.
- 🎯 **Highlighting of nodes** when searched or selected.
- 📤 **Export to PNG** (graph snapshot with inline styles).
- 📤 **Export to JSON** (current filtered subgraph).
- ⚡ **Centrality metrics**:
  - Static PageRank.
  - Temporal PageRank (with half-life decay in days).
- 🔒 **Scala + Akka HTTP API** to serve graph data.
- 📚 **Prepared for VirusTotal API integration** (documented as a future enhancement).

---

## 🛠️ Tech Stack

### Backend
- [Apache Spark](https://spark.apache.org/) → distributed processing.
- [GraphX](https://spark.apache.org/graphx/) → graph metrics calculation.
- [Akka HTTP](https://doc.akka.io/docs/akka-http/current/) → REST server.
- [Spray JSON](https://github.com/spray/spray-json) → JSON serialization.

### Frontend
- [D3.js v7](https://d3js.org/) → data visualization library.
- **HTML5 / CSS3 / JavaScript (ES6+).**

---

## 📂 Project Structure
```
threat-graph-mvp/
│── web/
│ ├── index.html # Main frontend
│ ├── style.css # Visual styles
│ └── app.js # Graph logic & UI
│
│── data/
│ ├── vertices.csv # Sample nodes (id, type, label, last_seen)
│ └── aristas.csv # Sample edges (src, dst)
│
│── src/main/scala/
│ └── Server.scala # Backend Akka HTTP + Spark + GraphX
│
│── LICENSE # MIT License
│── README.md # This file
└── docs/
└── screenshot.png # Example capture
```
---

## ▶️ How to Run the Project

### 1. Backend (Server.scala)

1. **Requirements:**
   - **Scala 2.12+**
   - **SBT**
   - **Apache Spark 3.x**

   💡 *Recommendation:* use **IntelliJ IDEA** with the **Scala plugin** for a smoother development experience (autocompletion, direct execution of `Server.scala`, integrated SBT support, etc.).

2. **Compile and run:**
   ```bash
   sbt run

---

## 🛠️ The server will be available at http://localhost:9000

---
# 📖 Example of VirusTotal Integration (future)

This MVP is prepared to be extended with real data from the VirusTotal API.
Example request in Node.js:

```
import fetch from "node-fetch";

const API_KEY = "API_KEY";
const domain = "example.com";

const res = await fetch(`https://www.virustotal.com/api/v3/domains/${domain}`, {
headers: { "x-apikey": API_KEY }
});
const data = await res.json();
console.log(data);
```
With this output, you could map domains ↔ IPs ↔ hashes ↔ certificates and feed the graph.
---

# 📌 Roadmap

Integrate with VirusTotal API for real-world nodes.

Improve the side panel with additional metrics.

Add automatic graph layout (grid/radial).

Add persistence with a database (e.g., MongoDB).

---
# 📜 License & Author

This project is licensed under the MIT License.
You are free to use, modify, and distribute it, provided proper attribution to the original author is maintained.

Created by: https://github.com/Josemi016
