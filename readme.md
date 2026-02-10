# Terraform Graph Visualizer

Visualize Terraform/OpenTofu plan dependencies as an interactive graph and query them with natural language.

![App Screenshot](./Screenshot%20from%202026-02-09%2016-08-24.png)

## Overview

This tool parses Terraform plan outputs and dependency graphs into an interactive visualization. It includes a React-based infinite canvas with AWS resource icons, pan/draw/erase tools, and a LangGraph-powered API for natural language queries about resource dependencies.

## Features

- **Graph generation** — Convert `tofu graph` output to an interactive SVG canvas
- **Natural language queries** — Ask questions like "What resources depend on the security group?"
- **Infinite canvas** — Pan, zoom, draw annotations, and explore large graphs
- **AWS icons** — Visual resource types (Lambda, S3, SQS, IAM, etc.)

## Prerequisites

- [OpenTofu](https://opentofu.org/) (or Terraform)
- Python 3
- Node.js (for the React app)

## Quick Start

### 1. Generate the plan and graph

```bash
tofu plan -out=tfplan
tofu show -json tfplan > plan.json
tofu graph -plan=tfplan > graph.dot
tofu graph -plan=tfplan | dot -Tsvg > graph.svg
```

### 2. Parse the graph to JSON

```bash
python parse_dot.py graph.dot > graph.json
```

### 3. Start the backend

```bash
cd flask-server
pip install -r requirements.txt
python app.py
```

### 4. Start the frontend

```bash
cd my-react-app
npm install
npm run dev
```

## Usage

### Query the graph via API

```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What resources depend on the security group?"}'
```

### Graph without a plan

```bash
tofu graph > graph.dot
python parse_dot.py graph.dot > graph.json
```

## Project Structure

| Directory       | Description                    |
|----------------|--------------------------------|
| `flask-server/`| Python backend, LangGraph, API |
| `my-react-app/`| React graph visualization      |
| `express-server/` | Node.js alternative backend |
| `parse_dot.py` | DOT → JSON parser              |
| `main.tf`      | Example Terraform config       |
