"""Audio routing graph API routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from calliope.audio.routing import (
    AudioGraph, SourceNode, EffectNode, BusNode, SendNode, OutputNode, VCAGroup,
    get_graph, set_graph,
)

router = APIRouter(prefix="/v1/routing", tags=["routing"])


class AddNodeRequest(BaseModel):
    session_id: str = "default"
    type: str
    name: str = "Node"
    generator: str | None = None


class ConnectRequest(BaseModel):
    session_id: str = "default"
    from_id: str
    to_id: str


class DisconnectRequest(BaseModel):
    session_id: str = "default"
    from_id: str
    to_id: str


class CreateBusRequest(BaseModel):
    session_id: str = "default"
    name: str = "Bus"
    volume: float = 1.0


class CreateSendRequest(BaseModel):
    session_id: str = "default"
    name: str = "Send"
    level: float = 0.5
    source_id: str = ""
    destination_id: str = ""


class CreateVCARequest(BaseModel):
    session_id: str = "default"
    name: str = "VCA Group"
    volume: float = 1.0


class AssignVCARequest(BaseModel):
    session_id: str = "default"


class RenderRequest(BaseModel):
    session_id: str = "default"
    duration_sec: float = 10.0


@router.post("/node")
async def add_node(req: AddNodeRequest) -> dict:
    graph = get_graph(req.session_id)
    if req.type == "source":
        node = SourceNode(name=req.name)
    elif req.type == "effect":
        node = EffectNode(name=req.name)
    elif req.type == "output":
        node = OutputNode(name=req.name)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown node type: {req.type}")
    graph.add_node(node)
    return {"id": node.id, "type": req.type, "name": node.name}


@router.delete("/node/{node_id}")
async def remove_node(node_id: str, session_id: str = "default") -> dict:
    graph = get_graph(session_id)
    if node_id not in graph.nodes:
        raise HTTPException(status_code=404, detail="Node not found")
    graph.remove_node(node_id)
    return {"status": "removed", "node_id": node_id}


@router.post("/connect")
async def connect_nodes(req: ConnectRequest) -> dict:
    graph = get_graph(req.session_id)
    if req.from_id not in graph.nodes:
        raise HTTPException(status_code=404, detail=f"Source node {req.from_id} not found")
    if req.to_id not in graph.nodes:
        raise HTTPException(status_code=404, detail=f"Target node {req.to_id} not found")
    graph.connect(req.from_id, req.to_id)
    return {"status": "connected", "from": req.from_id, "to": req.to_id}


@router.post("/disconnect")
async def disconnect_nodes(req: DisconnectRequest) -> dict:
    graph = get_graph(req.session_id)
    graph.disconnect(req.from_id, req.to_id)
    return {"status": "disconnected", "from": req.from_id, "to": req.to_id}


@router.get("/graph")
async def get_graph_state(session_id: str = "default") -> dict:
    graph = get_graph(session_id)
    return graph.to_dict()


@router.post("/render")
async def render_graph(req: RenderRequest) -> dict:
    graph = get_graph(req.session_id)
    output = graph.render(req.duration_sec)
    return {
        "duration_sec": req.duration_sec,
        "sample_rate": graph.sample_rate,
        "samples": output.tolist(),
        "channels": 1 if output.ndim == 1 else output.shape[0],
    }


@router.post("/bus")
async def create_bus(req: CreateBusRequest) -> dict:
    graph = get_graph(req.session_id)
    bus = BusNode(name=req.name, volume=req.volume)
    graph.add_bus(bus)
    return {"id": bus.id, "name": bus.name, "volume": bus.volume}


@router.post("/send")
async def create_send(req: CreateSendRequest) -> dict:
    graph = get_graph(req.session_id)
    send = SendNode(name=req.name, level=req.level, source_id=req.source_id, destination_id=req.destination_id)
    graph.add_send(send)
    return {"id": send.id, "name": send.name, "level": send.level}


@router.delete("/send/{send_id}")
async def remove_send(send_id: str, session_id: str = "default") -> dict:
    graph = get_graph(session_id)
    if send_id not in graph.sends:
        raise HTTPException(status_code=404, detail="Send not found")
    graph.remove_send(send_id)
    return {"status": "removed", "send_id": send_id}


@router.post("/vca")
async def create_vca(req: CreateVCARequest) -> dict:
    graph = get_graph(req.session_id)
    vca = VCAGroup(name=req.name, volume=req.volume)
    graph.add_vca_group(vca)
    return {"id": vca.id, "name": vca.name, "volume": vca.volume}


@router.post("/vca/{vca_id}/assign/{track_id}")
async def assign_to_vca(vca_id: str, track_id: str, session_id: str = "default") -> dict:
    graph = get_graph(session_id)
    if vca_id not in graph.vca_groups:
        raise HTTPException(status_code=404, detail="VCA group not found")
    graph.assign_to_vca(track_id, vca_id)
    return {"status": "assigned", "track_id": track_id, "vca_id": vca_id}
