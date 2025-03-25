# stunning-disco

A sandbox repository for storing and versioning resources across various technologies and use cases.

## Simple RAG

This repo builds on the `simple-rag` branch by focusing on the data processing required to get good embeddings in the database.

![Diagram](public/rag-ollama-diagram.png)
Credit: [link](https://weaviate.io/blog/local-rag-with-ollama-and-weaviate)

## Getting Started

1. Install Pyenv & Python
2. Install Python Dependencies
3. Install Ollama and models (e.g. llama3) `ollama pull llama3`
4. Start the vector database container `docker run -p 8080:8080 -p 50051:50051 cr.weaviate.io/semitechnologies/weaviate:1.24.8`
5. Start the parser `docker run -p 5010:5001 ghcr.io/nlmatics/nlm-ingestor:latest`
6. Download data `get_data.ipynb`
7. Process raw data `preprocess_data.ipynb`

## Resources

https://www.llamaindex.ai/blog/mastering-pdfs-extracting-sections-headings-paragraphs-and-tables-with-cutting-edge-parser-faea18870125
https://github.com/nlmatics/nlm-ingestor

[Chunking](https://github.com/xbeat/Machine-Learning/blob/main/Optimizing%20RAG%20with%20Document%20Chunking%20Techniques%20Using%20Python.md)
[Using Vector Store Index with Existing Weaviate Vector Store](https://docs.llamaindex.ai/en/stable/examples/vector_stores/existing_data/weaviate_existing_data/)
