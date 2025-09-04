### 📖 Idiomas disponibles 
- 🇬🇧 [English](README.en.md)


# Threat-graph

![MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Scala](https://img.shields.io/badge/Scala-2.12%2B-red)
![Spark](https://img.shields.io/badge/Spark-3.x-orange)
![D3.js](https://img.shields.io/badge/D3.js-v7-blue)
![Status](https://img.shields.io/badge/Live-Demo-success)

**Threat Graph** es una aplicación interactiva para visualizar relaciones entre **IPs, dominios, certificados y hashes** en un grafo dinámico.  
Este proyecto integra **Spark + GraphX (backend)** y **D3.js (frontend)** para construir un prototipo de análisis de amenazas cibernéticas.

> 🔗 **Demo:** https://josemi016.github.io/threat-graph-mvp/
---

## 📸 Capturas de pantalla

### Grafo generado
<img width="1919" height="937" alt="image" src="https://github.com/user-attachments/assets/baaf23af-d3ee-464b-b157-b8c02dfe32e2" />

---

## ✨ Funcionalidades principales

- 📊 **Visualización interactiva** con [D3.js](https://d3js.org/).
- 🟦 Nodos coloreados por tipo:
    - Azul: **Dominios**
    - Celeste: **IPs**
    - Naranja: **Certificados**
    - Rojo: **Hashes**
- 🔍 **Buscador de nodos** (por ID o label).
- 🖱️ **Panel lateral** con detalles del nodo seleccionado y sus vecinos.
- 🎯 **Destacado de nodos** al buscarlos o seleccionarlos.
- 📤 **Exportación en PNG** (captura del grafo con estilos inline).
- 📤 **Exportación en JSON** (subgrafo actual filtrado).
- ⚡ **Métricas de centralidad**:
    - PageRank estático.
    - PageRank temporal (con decaimiento por half-life en días).
- 🔒 **API en Scala + Akka HTTP** para servir los datos del grafo.
- 📚 **Preparado para integración con la API de VirusTotal** (documentada como futura mejora).

---

## 🛠️ Tecnologías utilizadas

### Backend
- [Apache Spark](https://spark.apache.org/) → procesamiento distribuido.
- [GraphX](https://spark.apache.org/graphx/) → cálculo de métricas en grafos.
- [Akka HTTP](https://doc.akka.io/docs/akka-http/current/) → servidor REST.
- [Spray JSON](https://github.com/spray/spray-json) → serialización JSON.

### Frontend
- [D3.js v7](https://d3js.org/) → librería de visualización de datos.
- **HTML5 / CSS3 / JavaScript (ES6+).**

---

## 📂 Estructura del proyecto
```
threat-graph-mvp/
│── web/
│ ├── index.html # Frontend principal
│ ├── style.css # Estilos visuales
│ └── app.js # Lógica de grafo y UI
│
│── data/
│ ├── vertices.csv # Nodos de ejemplo (id, type, label, last_seen)
│ └── aristas.csv # Aristas de ejemplo (src, dst)
│
│── src/main/scala/
│ └── Server.scala # Backend Akka HTTP + Spark + GraphX
│
│── LICENSE # Licencia MIT
│── README.md # Este archivo
└── docs/
└── screenshot.png # Captura de ejemplo
```
---
## ▶️ Cómo ejecutar el proyecto

### 1. Backend (Server.scala)

1. **Requisitos:**
    - **Scala 2.12+**
    - **SBT**
    - **Apache Spark 3.x**

   💡 *Recomendación:* utilizar **IntelliJ IDEA** con el plugin de **Scala** para una experiencia de desarrollo más cómoda (autocompletado, ejecución directa de `Server.scala`, integración con SBT, etc.).

2. **Compilar y ejecutar:**
   ```bash
   sbt run

---

## 🛠️ El Servidor se levanta en http://localhost:9000

---

# 📖 Ejemplo de integración con VirusTotal (futuro)

Este MVP está preparado para ampliarse con datos reales desde la API de VirusTotal.
Ejemplo de llamada en Node.js:

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
Con esta salida podrías mapear dominios ↔ IPs ↔ hashes ↔ certificados y alimentar el grafo.

---
# 📌 Roadmap de Futuras Modificaciones

Integración con API de VirusTotal para nodos reales.

Mejorar panel lateral con métricas adicionales.

Añadir organización automática del grafo (grid/radial).

Persistencia de datos con base de datos (ej. MongoDB).

---
# 📜 Licencia y Autor

Este proyecto está bajo la licencia MIT.
Puedes usarlo, modificarlo y distribuirlo libremente, siempre manteniendo la atribución al autor original.
Creador por: https://github.com/Josemi016
