# PromptSmith v0.1 - Project Status

**Date:** February 8, 2026

## 1. Project Aim & Vision
**PromptSmith** is an advanced "Prompt Factory" and MCP (Model Context Protocol) Server designed to automate the creation of full-stack software projects.

**Core Concept:**
1.  **Human**: Defines the high-level vision and tech stack in the PromptSmith Dashboard.
2.  **PromptSmith (Server)**: Breaks this vision down into a sequence of granular, executable coding tasks (Stages 1-7), creating a rigid "Build Plan".
3.  **Client Agent (AI)**: Connects via MCP, fetches these tasks one by one, and executes the code generation on the local machine.

The goal is to turn a single sentence idea into a production-ready repository with backend, frontend, docs, and tests.


## 2. Project Phases & Workflow
The creation process follows a structured sequence of phases, ensuring that the AI has complete context before writing a single line of code.


### Phase 1: Vision
Defining the high-level goal (e.g., "A Flappy Bird clone with a leaderboard").

### Phase 2: User Flow
Mapping out how a user interacts with the application.

### Phase 3: Tech Choices
Selecting the stack (Next.js, MongoDB, Tailwind, etc.).

### Phase 4: Rules
Setting coding standards, linting rules, and architectural constraints.

### Phase 5: Data Models
Designing the database schema (e.g., `User`, `Score`, `GameSession`).

### Phase 6: APIs
Defining the REST/RPC endpoints and their contracts.

### Phase 7: Execution (The "Prompt Factory")
Once the planning phases are complete, the **Prompt Factory** generates the code in 7 precise stages:

-   **Stage 1-7 Implementation**:
    -   **Stage 1**: Environment Variables setup.
    -   **Stage 2**: Backend File Structure (Folders & Placeholders).
    -   **Stage 3**: Backend Implementation (Core Logic).
    -   **Stage 4**: API Documentation (`API_DOCUMENTATION.md`).
    -   **Stage 5**: Frontend Structure (Next.js/React).
    -   **Stage 6**: Frontend Components (Batch generation).
    -   **Stage 7**: API Integration Tests (Jest/Supertest).
-   **Prompt Factory UI**:
    -   Renamed from "Execute Coding" to "Prompt Factory" to reflect its purpose.
    -   Refined the UI to show all 7 stages clearly.

### MCP Infrastructure Enhancements
-   **Smart Task Delivery**:
    -   Updated `get_pending_tasks` to return the **Full Prompt Content** inline.
    -   *Benefit*: The Client Agent no longer needs to make a second `read_resource` call, halving the round-trips and reducing error rates.
-   **Reset Capabilities**:
    -   Added `reset_project_tasks` tool.
    -   Added logical checks to ensure the Agent starts fresh on a new build.

---

## 3. Current Limitations & Issues
While the pipeline is functional, we have identified key areas for improvement:

1.  **Transport Protocol Mismatch**:
    -   The system is currently set up for Server-Sent Events (SSE).
    -   **Issue**: This has proven unstable for local development (connection loops) and serverless deployment (timeouts).
    -   **Goal**: We must migrate to a standard HTTP/REST architecture to ensure robust, stateless communication.

2.  **Mini-Model Hallucinations**:
    -   Testing with smaller/faster models revealed significant degradation in code quality.
    -   **Symptoms**: Duplicated code, missing dependencies, and unreferenced variables.
    -   **Cause**: The current "monolithic" prompt batches are too complex for smaller context windows.

3.  **Missing Requirement Gathering**:
    -   The planning phase currently skips asset gathering.
    -   **Issue**: The system fails to ask the user for specific resources (e.g., images, sprites, custom assets) even if the user has preferences.


---

## 4. Next Goal: Feature-Based Batching
To solve the mini-model hallucination issue, we will fundamentally restructure the generation strategy.

**Current Strategy**: Splitting by Architecture (Frontend vs. Backend vs. Files).
**New Strategy**: Splitting by **Game Mechanics / Features**.

**Why?**
-   Instead of generating "All React Components", we will generate "The Score System" (Backend + Frontend + State together).
-   This provides a smaller, self-contained context window for the AI, significantly increasing the success rate for mini-models.

---

## 5. Pending Listed Action Items

These are specific technical tasks required to resolve the identified issues (excluding the main "Feature-Based Batching" goal):

### 1. Migrate to HTTP/REST Architecture
**Objective**: Replace the unstable Server-Sent Events (SSE) transport with standard stateless HTTP requests for MCP.
-   [ ] **Refactor API**: Create standard `POST /api/mcp` endpoints for JSON-RPC messages.
-   [ ] **Session Management**: Move session state from in-memory maps to MongoDB (using `userId` as key).
-   [ ] **Client Config**: Update client configuration instructions to use the new HTTP endpoint.

### 2. Implement Asset Gathering Phase
**Objective**: Ensure the AI has access to user-preferred visual assets before generating code.
-   [ ] **Update Dashboard**: Add a new "Assets" step in Phase 1 (Planning).
-   [ ] **File Upload/Link**: Allow users to upload images or provide URLs for logos, sprites, etc.
-   [ ] **Prompt Injection**: Update `seed_prompts.ts` to inject these asset references into the Frontend Generation prompts.

### 3. Agent Error Handling Implementation
**Objective**: Improve the Client Agent's resilience.
-   [ ] **Library Fixer**: Implement the "Senior Engineer" fallback logic in the Agent to auto-correct outdated library versions during the final build stage.
-   [ ] **Environment Prompts**: Ensure the Agent pauses and explicitly asks the user for missing `.env` variables if they weren't provided in the initial prompt.

### 4. Custom Microservices & Layered Architecture
**Objective**: Move beyond monolithic Next.js apps to support custom service layers and microservice architectures.
-   [ ] **Layer Definition**: Allow users to define custom architectural layers (e.g., Domain, Application, Infrastructure).
-   [ ] **Service Isolation**: Support generating independent service modules instead of a shared codebase.
