from langchain import hub 
from langchain_community.chat_models import ChatOllama
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains import create_retrieval_chain, create_history_aware_retriever
from langchain.chains.combine_documents import create_stuff_documents_chain


def setup_chain(model_name, retriever):
    llm = ChatOllama(model=model_name, base_url="http://127.0.0.1:11434", keep_alive=-1)
    
    contextualize_q_system_prompt = (
        "Given a chat history and the latest user question, "
        "formulate a standalone question that can be understood "
        "without the chat history."
    )
    contextualize_q_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", contextualize_q_system_prompt),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ]
    )
    history_aware_retriever = create_history_aware_retriever(
        llm, retriever, contextualize_q_prompt
    )
    
    system_prompt = (
        "You are an assistant named Benedict. Your task is question-answering. "
        "Use the retrieved context to answer concisely. If you don't know, inform the user."
        "\n\n{context}"
    )
    qa_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ]
    )
    question_answer_chain = create_stuff_documents_chain(llm, qa_prompt)
    rag_chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)
    
    return rag_chain