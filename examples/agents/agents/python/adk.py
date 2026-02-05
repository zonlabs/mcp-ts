"""Basic Chat feature."""

from __future__ import annotations

from fastapi import FastAPI
from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from google.adk.agents import LlmAgent
from google.adk import tools as adk_tools
from google.adk.models.lite_llm import LiteLlm  # For multi-model support

import logging

GEMINI_MODEL = "gemini-2.0-flash"
OPENAI_MODEL = "openai/gpt-4o"
DEEPSEEK_MODEL = "deepseek/deepseek-chat"
MODEL_CLAUDE_SONNET = "anthropic/claude-3-sonnet-20240229"
model = LiteLlm(model=DEEPSEEK_MODEL)
# Configure logging level
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Component-specific loggers
logging.getLogger('adk_agent').setLevel(logging.DEBUG)
logging.getLogger('event_translator').setLevel(logging.INFO)
logging.getLogger('session_manager').setLevel(logging.WARNING)
logging.getLogger('endpoint').setLevel(logging.ERROR)

# Create a sample ADK agent (this would be your actual agent)
sample_agent = LlmAgent(
    name="assistant",
    model=model,
    instruction="""
You are a helpful AI assistant that helps users with MCP Tools.
Note: you can call multiple tools at the same time to save up time.
    """,
)

# Create ADK middleware agent instance
chat_agent = ADKAgent(
    adk_agent=sample_agent,
    app_name="agents",
    user_id="demo_user",
    session_timeout_seconds=3600,
    use_in_memory_services=True
)

# Create FastAPI app
app = FastAPI(title="ADK Middleware Basic Chat")

# Add the ADK endpoint
add_adk_fastapi_endpoint(app, chat_agent, path="/agent")