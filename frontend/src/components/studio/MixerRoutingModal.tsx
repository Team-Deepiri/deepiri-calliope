import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Plus, Trash2, GitBranch, Volume2,
  Shuffle, LayoutGrid, Circle,
} from "lucide-react";
import type { MixerChannel, RoutingNode } from "../../types/audio";

interface MixerRoutingModalProps {
  open: boolean;
  onClose: () => void;
  channels: MixerChannel[];
  routingNodes: RoutingNode[];
  busses: Array<{ id: string; name: string; volume: number }>;
  sends: Array<{ id: string; name: string; level: number; source: string; destination: string }>;
  vcaGroups: Array<{ id: string; name: string; volume: number }>;
  vcaAssignments: Record<string, string>;
  onAddNode: (type: string, name: string) => void;
  onRemoveNode: (id: string) => void;
  onConnect: (from: string, to: string) => void;
  onDisconnect: (from: string, to: string) => void;
  onAddBus: (name: string) => void;
  onAddSend: (name: string) => void;
  onRemoveSend: (id: string) => void;
  onAddVCA: (name: string) => void;
  onAssignVCA: (trackId: string, vcaId: string) => void;
}

type RoutingTab = "matrix" | "busses" | "sends" | "vca";

export function MixerRoutingModal({
  open,
  onClose,
  channels,
  routingNodes,
  busses,
  sends,
  vcaGroups,
  vcaAssignments,
  onAddNode,
  onRemoveNode,
  onConnect,
  onDisconnect,
  onAddBus,
  onAddSend,
  onRemoveSend,
  onAddVCA,
  onAssignVCA,
}: MixerRoutingModalProps) {
  const [activeTab, setActiveTab] = useState<RoutingTab>("matrix");

  const [newBusName, setNewBusName] = useState("");
  const [newSendName, setNewSendName] = useState("");
  const [newVCAName, setNewVCAName] = useState("");
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeType, setNewNodeType] = useState<string>("source");

  const handleCellClick = useCallback(
    (sourceId: string, targetId: string) => {
      const exists = routingNodes
        .find((n) => n.id === sourceId)
        ?.connections.includes(targetId);

      if (exists) {
        onDisconnect(sourceId, targetId);
      } else {
        onConnect(sourceId, targetId);
      }
    },
    [routingNodes, onConnect, onDisconnect],
  );

  if (!open) return null;

  const tabs: { id: RoutingTab; label: string; icon: React.ReactNode }[] = [
    { id: "matrix", label: "Routing Matrix", icon: <LayoutGrid size={14} /> },
    { id: "busses", label: "Busses", icon: <GitBranch size={14} /> },
    { id: "sends", label: "Sends", icon: <Shuffle size={14} /> },
    { id: "vca", label: "VCA Groups", icon: <Volume2 size={14} /> },
  ];

  const nodeColor = (type: string) => {
    switch (type) {
      case "source": return "text-green-400";
      case "effect": return "text-purple-400";
      case "bus": return "text-cyan-400";
      case "send": return "text-orange-400";
      case "output": return "text-blue-400";
      default: return "text-gray-400";
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl w-[900px] max-h-[80vh] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <LayoutGrid className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-bold text-gray-100">Routing Configuration</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-4 pt-3 bg-gray-900/50">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-bold transition-all ${
                    activeTab === tab.id
                      ? "bg-gray-800 text-blue-400 border-t border-l border-r border-gray-700"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {/* Routing Matrix */}
              {activeTab === "matrix" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <input
                      value={newNodeName}
                      onChange={(e) => setNewNodeName(e.target.value)}
                      placeholder="Node name..."
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 flex-1"
                    />
                    <select
                      value={newNodeType}
                      onChange={(e) => setNewNodeType(e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
                    >
                      <option value="source">Source</option>
                      <option value="effect">Effect</option>
                      <option value="output">Output</option>
                    </select>
                    <button
                      onClick={() => {
                        if (newNodeName.trim()) {
                          onAddNode(newNodeType, newNodeName.trim());
                          setNewNodeName("");
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors"
                    >
                      <Plus size={14} />
                      Add Node
                    </button>
                  </div>

                  {routingNodes.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Circle className="w-8 h-8 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No routing nodes yet. Add sources, effects, or outputs above.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            <th className="p-1.5 text-left text-gray-500 font-bold uppercase tracking-wider">Source \ Target</th>
                            {routingNodes.map((node) => (
                              <th
                                key={node.id}
                                className={`p-1.5 text-center font-bold uppercase tracking-wider ${nodeColor(node.type)}`}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  {node.name}
                                  <button
                                    onClick={() => onRemoveNode(node.id)}
                                    className="p-0.5 hover:bg-red-500/20 rounded text-gray-600 hover:text-red-400"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {routingNodes.map((source) => (
                            <tr key={source.id}>
                              <td className={`p-1.5 font-bold ${nodeColor(source.type)}`}>
                                <div className="flex items-center gap-1">
                                  <Circle size={6} />
                                  {source.name}
                                </div>
                              </td>
                              {routingNodes.map((target) => {
                                const connected = source.connections.includes(target.id);
                                const isSelf = source.id === target.id;
                                return (
                                  <td
                                    key={target.id}
                                    className={`p-1 text-center ${
                                      isSelf
                                        ? "bg-gray-900/50"
                                        : "cursor-pointer hover:bg-gray-800/50 transition-colors"
                                    }`}
                                    onClick={() => !isSelf && handleCellClick(source.id, target.id)}
                                  >
                                    {!isSelf && (
                                      <div
                                        className={`w-4 h-4 mx-auto rounded transition-all ${
                                          connected
                                            ? "bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]"
                                            : "bg-gray-700 hover:bg-gray-600"
                                        }`}
                                      />
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-[10px] text-gray-500 pt-2 border-t border-gray-800">
                    <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-500" /> Connected</span>
                    <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-gray-700" /> Disconnected</span>
                    <span className="flex items-center gap-1"><Circle size={6} className="text-green-400" /> Source</span>
                    <span className="flex items-center gap-1"><Circle size={6} className="text-purple-400" /> Effect</span>
                    <span className="flex items-center gap-1"><Circle size={6} className="text-blue-400" /> Output</span>
                  </div>
                </div>
              )}

              {/* Busses */}
              {activeTab === "busses" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      value={newBusName}
                      onChange={(e) => setNewBusName(e.target.value)}
                      placeholder="Bus name..."
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 flex-1"
                    />
                    <button
                      onClick={() => {
                        if (newBusName.trim()) {
                          onAddBus(newBusName.trim());
                          setNewBusName("");
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-bold transition-colors"
                    >
                      <Plus size={14} />
                      Add Bus
                    </button>
                  </div>

                  {busses.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <GitBranch className="w-8 h-8 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No busses configured.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {busses.map((bus) => (
                        <div
                          key={bus.id}
                          className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3 border border-gray-700/50"
                        >
                          <div className="flex items-center gap-3">
                            <GitBranch className="w-4 h-4 text-cyan-400" />
                            <span className="font-bold text-gray-200">{bus.name}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-xs text-gray-500">
                              Vol: {Math.round(bus.volume * 100)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Sends */}
              {activeTab === "sends" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      value={newSendName}
                      onChange={(e) => setNewSendName(e.target.value)}
                      placeholder="Send name..."
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 flex-1"
                    />
                    <button
                      onClick={() => {
                        if (newSendName.trim()) {
                          onAddSend(newSendName.trim());
                          setNewSendName("");
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-bold transition-colors"
                    >
                      <Plus size={14} />
                      Add Send
                    </button>
                  </div>

                  {sends.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Shuffle className="w-8 h-8 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No FX sends configured.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sends.map((send) => (
                        <div
                          key={send.id}
                          className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3 border border-gray-700/50"
                        >
                          <div className="flex items-center gap-3">
                            <Shuffle className="w-4 h-4 text-orange-400" />
                            <span className="font-bold text-gray-200">{send.name}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-xs text-gray-500">
                              Level: {Math.round(send.level * 100)}%
                            </span>
                            <button
                              onClick={() => onRemoveSend(send.id)}
                              className="p-1 hover:bg-red-500/20 rounded text-gray-600 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* VCA Groups */}
              {activeTab === "vca" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      value={newVCAName}
                      onChange={(e) => setNewVCAName(e.target.value)}
                      placeholder="VCA group name..."
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 flex-1"
                    />
                    <button
                      onClick={() => {
                        if (newVCAName.trim()) {
                          onAddVCA(newVCAName.trim());
                          setNewVCAName("");
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold transition-colors"
                    >
                      <Plus size={14} />
                      Add VCA
                    </button>
                  </div>

                  {vcaGroups.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Volume2 className="w-8 h-8 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No VCA groups configured.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {vcaGroups.map((vca) => (
                        <div
                          key={vca.id}
                          className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <Volume2 className="w-4 h-4 text-green-400" />
                              <span className="font-bold text-gray-200">{vca.name}</span>
                            </div>
                            <span className="text-xs text-gray-500">
                              Vol: {Math.round(vca.volume * 100)}%
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {channels
                              .filter((c) => vcaAssignments[c.id] === vca.id)
                              .map((c) => (
                                <span
                                  key={c.id}
                                  className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                  style={{ backgroundColor: c.color + "20", color: c.color }}
                                >
                                  {c.name}
                                </span>
                              ))}
                            {channels
                              .filter((c) => vcaAssignments[c.id] !== vca.id)
                              .slice(0, 5)
                              .map((c) => (
                                <button
                                  key={c.id}
                                  onClick={() => onAssignVCA(c.id, vca.id)}
                                  className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-gray-700/50 text-gray-500 hover:bg-gray-700 hover:text-gray-300 transition-colors"
                                >
                                  +{c.name}
                                </button>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-800 bg-gray-900/50">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-bold transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
