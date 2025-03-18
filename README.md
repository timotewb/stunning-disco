# stunning-disco

A sandbox repository for storing and versioning resources across various technologies and use cases.

## Simple RAG

This repo builds on the `simple-rag` branch by focusing on the data processing required to get good embeddings in the database.

![Diagram](public/rag-ollama-diagram.png)
Credit: [link](https://weaviate.io/blog/local-rag-with-ollama-and-weaviate)

## Getting Started

1. Install Pyenv & Python
2. Install Python Dependencies
3. Install Ollama and models (e.g. llama2 & all-minilm) `ollama pull llama2` `ollama pull all-minilm`
4. Start the vector database container `docker run -p 8080:8080 -p 50051:50051 cr.weaviate.io/semitechnologies/weaviate:1.24.8`
5. Download data `get_data.ipynb`

## Resources
