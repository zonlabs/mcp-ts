"""
A simple agentic chat flow using LangGraph instead of CrewAI.
"""

import os

from langchain.agents import create_agent
from langchain_core.tools import tool

from copilotkit import CopilotKitMiddleware, CopilotKitState
from langgraph.checkpoint.memory import MemorySaver

# Compile the graph
memory = MemorySaver()
graph = create_agent(
    model="openai:gpt-4o",
    tools=[],  # Backend tools go here
    middleware=[CopilotKitMiddleware()],
    system_prompt="You are a helpful assistant.",
    checkpointer=memory,
    state_schema=CopilotKitState
    )
