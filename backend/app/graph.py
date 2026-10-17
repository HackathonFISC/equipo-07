from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from app.agents import Agents
from app.contracts import ReviewInput
from app.services import apply_decision, trace


class WorkflowState(TypedDict, total=False):
    execution_id: str
    normalized: dict
    incident_id: str
    association_status: str
    priority: dict
    review: dict
    terminal: str


def build_graph(db, provider, settings, saver):
    agents = Agents(db, provider, settings)

    async def insufficient(state):
        return {"terminal": "NEEDS_INFORMATION"}

    async def human_review(state):
        decision = interrupt({"execution_id": state["execution_id"], "priority": state["priority"]})
        return {"review": ReviewInput.model_validate(decision).model_dump()}

    async def finalize(state):
        review = ReviewInput.model_validate(state["review"])
        await apply_decision(db, state["execution_id"], review)
        return {"terminal": "REJECTED" if review.decision == "REJECT" else "APPROVED"}

    def traced(name, function):
        async def node(state):
            async with db.sessions.begin() as session:
                trace(session, state["execution_id"], name, "START")
            try:
                result = await function(state)
            except Exception as exc:
                async with db.sessions.begin() as session:
                    trace(session, state["execution_id"], name, "ERROR", error=type(exc).__name__)
                raise
            async with db.sessions.begin() as session:
                trace(session, state["execution_id"], name, "END")
            return result

        return node

    graph = StateGraph(WorkflowState)
    graph.add_node("ingestion", traced("ingestion", agents.ingest))
    graph.add_node("verification", traced("verification", agents.verify))
    graph.add_node("coordination", traced("coordination", agents.coordinate))
    graph.add_node("insufficient", insufficient)
    graph.add_node("human_review", human_review)
    graph.add_node("finalize", traced("finalize", finalize))
    graph.add_edge(START, "ingestion")
    graph.add_conditional_edges(
        "ingestion",
        lambda s: "insufficient" if s["normalized"]["kind"] == "UNKNOWN" else "verification",
    )
    graph.add_edge("insufficient", END)
    graph.add_edge("verification", "coordination")
    graph.add_edge("coordination", "human_review")
    graph.add_edge("human_review", "finalize")
    graph.add_edge("finalize", END)
    return graph.compile(checkpointer=saver)
