"""Deploy RewindOps agent to Google Cloud Agent Builder (Vertex AI Agent Engine).

This script deploys the ADK agent to the Gemini Enterprise Agent Platform,
making it a Google Cloud Agent Builder agent with managed infrastructure.

Prerequisites:
  - gcloud CLI authenticated with appropriate project
  - Vertex AI API enabled
  - Agent Engine API enabled
  - GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION set in .env

Usage:
  python deploy_agent_engine.py
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()


def deploy():
    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

    if not project:
        print("ERROR: GOOGLE_CLOUD_PROJECT not set in .env")
        sys.exit(1)

    print(f"Deploying RewindOps agent to Agent Engine...")
    print(f"  Project:  {project}")
    print(f"  Location: {location}")

    try:
        from google.adk.deploy import agent_engine

        agent_engine.deploy(
            agent_folder="rewindops_agent",
            project=project,
            location=location,
            agent_name="rewindops-ai",
            display_name="RewindOps AI Agent",
            description="The undo layer for MCP-powered agents. Built with Google Cloud Agent Builder and Gemini 3.",
        )

        print("\nDeployment successful!")
        print(f"Agent available at: https://console.cloud.google.com/vertex-ai/agents?project={project}")
        print(f"API endpoint: https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/agents/rewindops-ai")

    except ImportError:
        print("\nFallback: Using gcloud CLI deployment...")
        print("Run the following command:")
        print(f"  adk deploy cloud_run --project={project} --region={location} rewindops_agent")
        print("\nOr deploy to Agent Engine via console:")
        print(f"  1. Go to https://console.cloud.google.com/vertex-ai/agents?project={project}")
        print(f"  2. Create new agent → Import from ADK")
        print(f"  3. Point to this directory's rewindops_agent/ folder")

    except Exception as e:
        print(f"\nDeployment error: {e}")
        print("\nFallback: Deploy to Cloud Run with ADK:")
        print(f"  adk deploy cloud_run --project={project} --region={location} rewindops_agent")
        sys.exit(1)


if __name__ == "__main__":
    deploy()
