import re
from typing import List
import nltk
nltk.download('punkt')

def document_based_chunking(text: str) -> list[str]:
    paragraphs = re.split(r'\n\s*\n', text)
    chunks = []
    
    for paragraph in paragraphs:
        sentences = nltk.sent_tokenize(paragraph)
        current_chunk = ""
        
        for sentence in sentences:
            if len(current_chunk) + len(sentence) <= 100:
                current_chunk += sentence + " "
            else:
                chunks.append(current_chunk.strip())
                current_chunk = sentence + " "
        
        if current_chunk:
            chunks.append(current_chunk.strip())
    
    return chunks



def fixed_size_chunking(text, chunk_size):
    sentences = nltk.sent_tokenize(text)
    chunks = []
    current_chunk = ""
    
    for sentence in sentences:
        if len(current_chunk) + len(sentence) <= chunk_size:
            current_chunk += sentence + " "
        else:
            chunks.append(current_chunk.strip())
            current_chunk = sentence + " "
    
    if current_chunk:
        chunks.append(current_chunk.strip())
    
    return chunks

def recursive_chunking(text, max_chunk_size, min_chunk_size):
    if len(text) <= max_chunk_size:
        return [text]
    
    mid = len(text) // 2
    left_chunk = text[:mid]
    right_chunk = text[mid:]
    
    if len(left_chunk) < min_chunk_size or len(right_chunk) < min_chunk_size:
        return [text]
    
    return recursive_chunking(left_chunk, max_chunk_size, min_chunk_size) + \
           recursive_chunking(right_chunk, max_chunk_size, min_chunk_size)

def fixed_size_chunking_with_overlap(text, chunk_size, overlap):
    words = text.split()
    chunks = []
    start = 0
    
    while start < len(words):
        end = start + chunk_size
        chunk = ' '.join(words[start:end])
        chunks.append(chunk)
        start += chunk_size - overlap
    
    return chunks

def sentence_based_chunking(text: str, max_sentences: int) -> List[str]:
    sentences: List[str] = nltk.sent_tokenize(text)
    chunks: List[str] = []
    current_chunk: List[str] = []
    
    for sentence in sentences:
        if len(current_chunk) < max_sentences:
            current_chunk.append(sentence)
        else:
            chunks.append(' '.join(current_chunk))
            current_chunk = [sentence]
    
    if current_chunk:
        chunks.append(' '.join(current_chunk))
    
    return chunks

from transformers import AutoTokenizer

def token_based_chunking(text, max_tokens):
    tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")
    tokens = tokenizer.tokenize(text)
    chunks = []
    current_chunk = []
    
    for token in tokens:
        if len(current_chunk) < max_tokens:
            current_chunk.append(token)
        else:
            chunks.append(tokenizer.convert_tokens_to_string(current_chunk))
            current_chunk = [token]
    
    if current_chunk:
        chunks.append(tokenizer.convert_tokens_to_string(current_chunk))
    
    return chunks