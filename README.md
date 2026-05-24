# RewindOps AI

**The secure rollback & undo layer for MCP-powered agents.**

RewindOps AI is built with the **Google GenAI SDK / Google Cloud Agent Builder** and **Gemini 2.5** as the primary agent layer. We use **ADK** (Agent Development Kit) for the custom code-owned runtime that powers the RewindOps policy proxy, state checkpoint service, rollback engine, and **MongoDB MCP** integration.

---

## 💡 The Problem

As companies connect AI agents to real tools and databases, agents can mutate business state. If an agent cancels the wrong subscription, deletes the wrong invoice, or changes the wrong customer record, simple logging is not enough. 

## 🛡️ The Solution

RewindOps makes risky agent actions **observable, approval-gated, and fully reversible**:

1. **Risk Classification** — deterministic scoring of every write action.
2. **State Checkpointing** — full MongoDB document snapshots before mutation, with native `INSERT` (delete on rollback) and `DELETE` (re-insert on rollback) support.
3. **Blast Radius Preview** — Gemini 2.5-powered explanation of what will change.
4. **Human Approval Gate** — high-risk actions require explicit approval.
5. **Execution Receipts** — full audit trail of every action.
6. **One-Click Rollback** — restore checkpointed state instantly.

---

## 🏗️ Architecture

```
User
  ↓
Web App (Next.js / Vercel)
  ↓
FastAPI Server (Local / Cloud Run)
  ├── POST /run_sse          → SSE agent chat stream
  ├── GET  /api/actions      → action history
  ├── GET  /api/actions/:id  → action detail
  └── POST /api/actions/:id/rollback → one-click rollback
  ↓
Google Cloud Agent Builder Agent (Gemini 2.5 via ADK)
  ↓
Tools:
  ├── RewindOps Custom Tools (ADK FunctionTools)
  │     ├── classify_risk
  │     ├── create_checkpoint
  │     ├── preview_blast_radius
  │     ├── request_approval
  │     ├── execute_action
  │     └── rollback_action
  │
  └── MongoDB MCP Server (Stdio Partner Integration)
        └── find, aggregate, count (restricted reads)
  ↓
MongoDB Atlas
  ├── acmesub.customers
  ├── acmesub.subscriptions
  ├── acmesub.invoices
  ├── rewindops.action_checkpoints
  ├── rewindops.action_receipts
  └── rewindops.rollback_events
```

---

## 💻 Tech Stack

| Component | Technology |
| :--- | :--- |
| **Agent Platform** | Google Cloud Agent Builder (Gemini Enterprise Agent Platform) |
| **LLM** | Gemini 2.5 (`gemini-2.5-flash`) |
| **Agent Runtime** | Google ADK |
| **API Server** | FastAPI + Uvicorn |
| **Partner MCP** | MongoDB MCP Server (via **STDIO transport** spawning `npx` / `npx.cmd`) |
| **Database** | MongoDB Atlas |
| **Frontend** | Next.js 14 / TypeScript / Tailwind CSS |

---

## ⚡ Quick Start

### 1. Prerequisites

*   Python 3.11+
*   Node.js 20+
*   MongoDB Atlas cluster
*   Google Gemini API key

### 2. Local Setup & Configuration

Clone the repository and copy the environment template:

```bash
git clone https://github.com/your-org/rewindops-ai.git
cd rewindops-ai
cp .env.example .env
```

Open `.env` and configure your credentials:
```env
MONGODB_URI="mongodb+srv://..."
GOOGLE_API_KEY="AIzaSy..."
GEMINI_MODEL="gemini-2.5-flash"
```

### 3. Seed the Database

Seed your MongoDB Atlas cluster with demo customer data:

```bash
cd backend
pip install -r requirements.txt
python -m rewindops_agent.seed_data
```

### 4. Start the Backend

Start the FastAPI application process:

```bash
python -m rewindops_agent --reload
```

The backend server runs at [http://localhost:8000](http://localhost:8000) with hot-reloading enabled.

### 5. Start the Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

The web console launches at [http://localhost:3000](http://localhost:3000). 

---

## 🧪 Running Tests

We maintain a rigorous test suite validating all checkpointing, risk classification, and rollback modes (`INSERT`, `UPDATE`, `DELETE` operations):

```bash
cd backend
venv\Scripts\pytest
```

**Unit Test Output:**
```powershell
rewindops_agent\tests\test_checkpoint.py ...                             [ 23%]
rewindops_agent\tests\test_risk_classifier.py .....                      [ 61%]
rewindops_agent\tests\test_rollback.py .....                             [100%]

============================= 13 passed in 0.33s ==============================
```

---

## 🤝 MongoDB MCP Partner Integration

RewindOps connects directly to the [MongoDB MCP Server](https://github.com/mongodb-js/mongodb-mcp-server) using standard input/output (**STDIO**) transport:
*   This removes the need to run an external Express HTTP/SSE proxy.
*   By spawning the MCP server locally using `npx.cmd` (on Windows) or `npx` (on Unix) via `StdioConnectionParams`, ADK manages the full lifecycle of the partner integration with zero configuration.

### 🛡️ Programmatic Tool Filtering & Schema Protection
To ensure absolute reliability and security:
*   We expose only standard query tools to Gemini: `tool_filter=['find', 'count', 'aggregate']`.
*   This strips away the 26 administrative and mutation tools (e.g., `drop-database`, `create-index`) which are unnecessary for support agents.
*   It also prevents Gemini API parser crashes associated with blank schemas in administrative endpoints, enhancing system stability.

---

## 🏆 Hackathon Details

Built for the **Google Cloud Rapid Agent Hackathon** — **MongoDB Partner Track**.

**Built with:** Google Cloud Agent Builder, Gemini 2.5, MongoDB MCP Server, Google ADK, FastAPI, MongoDB Atlas, Next.js.

## 📄 License

MIT
