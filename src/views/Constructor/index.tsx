import { useCallback, useRef } from 'react';
import ReactFlow, {
    addEdge,
    Background,
    useEdgesState,
    useNodesState,
    useReactFlow,
} from 'reactflow';
import type { OnConnectEnd, Node, Edge, Connection, NodeOrigin } from 'reactflow';
import 'reactflow/dist/style.css';

const initialNodes: Node[] = [
    {
        id: '0',
        type: 'input',
        data: { label: 'Node' },
        position: { x: 0, y: 50 },
    },
];

let id = 1;
const getId = (): string => `${id++}`;

const nodeOrigin: NodeOrigin = [0.5, 0];

export default function ConstructorPage() {
    const reactFlowWrapper = useRef<HTMLDivElement | null>(null);

    const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    const { screenToFlowPosition } = useReactFlow();

    const onConnect = useCallback(
        (connection: Connection) => {
            setEdges((eds) => addEdge(connection, eds));
        },
        [],
    );

    const onConnectEnd = (
        event: MouseEvent | TouchEvent,
        connectionState: any,
        ..._rest: unknown[]
    ) => {
        if (!connectionState || connectionState.isValid || !connectionState.fromNode) {
            return;
        }

        const newId = getId();

        const { clientX, clientY } =
            event instanceof TouchEvent
                ? event.changedTouches[0]
                : event;

        const position = screenToFlowPosition({
            x: clientX,
            y: clientY,
        });

        const newNode: Node = {
            id: newId,
            position,
            data: { label: `Node ${newId}` },
        };

        setNodes((nds) => nds.concat(newNode));

        setEdges((eds) =>
            eds.concat({
                id: `e-${connectionState.fromNode.id}-${newId}`,
                source: connectionState.fromNode.id,
                target: newId,
            }),
        );
    };

    return (
        <div ref={reactFlowWrapper} style={{ height: '100vh' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onConnectEnd={onConnectEnd}
                nodeOrigin={nodeOrigin}
                fitView
            >
                <Background />
            </ReactFlow>
        </div>
    );
}
