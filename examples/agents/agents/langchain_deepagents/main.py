import os
import uvicorn
from fastapi import FastAPI

from dotenv import load_dotenv

load_dotenv()

from ag_ui_langgraph import LangGraphAgent, add_langgraph_fastapi_endpoint
from copilotkit import LangGraphAGUIAgent
from agent import graph as agentic_chat_graph

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="LangGraph Dojo Example Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

langgraph_agent = LangGraphAGUIAgent(
        name="mcpAssistant",
        description="An example for an agentic chat flow using LangGraph.",
        graph=agentic_chat_graph,
    )


add_langgraph_fastapi_endpoint(
    app=app, agent=langgraph_agent, path="/agent"
)
