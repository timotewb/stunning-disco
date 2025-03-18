# stunning-disco

A sandbox repository for storing and versioning resources across various technologies and use cases.

## Simple RAG

This repo stores code to build a simple RAG pipeline storing and querying data from a vector store running in Docker. Everything is locally run using ollama, docker and python scripts.

![Diagram](public/rag-ollama-diagram.png)
Credit: [link](https://weaviate.io/blog/local-rag-with-ollama-and-weaviate)

## Getting Started

1. Install Pyenv & Python
2. Install Python Dependencies
3. Install Ollama and models (e.g. llama2 & all-minilm) `ollama pull llama2` `ollama pull all-minilm`
4. Start the vector database container `docker run -p 8080:8080 -p 50051:50051 cr.weaviate.io/semitechnologies/weaviate:1.24.8`

## Resources

Interesting article on [Evaluation Metrics](https://weaviate.io/blog/retrieval-evaluation-metrics)
