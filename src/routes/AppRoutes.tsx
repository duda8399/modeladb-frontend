import { Routes, Route } from 'react-router-dom';
import { ReactFlowProvider } from 'reactflow';
import MainPage from '../views/MainPage';
import ConstructorPage from '../views/Constructor';

export function AppRoutes() {
    return (
        <ReactFlowProvider>
            <Routes>
                <Route path="/" element={<MainPage />} />
                <Route path="/model" element={<ConstructorPage />} />
            </Routes>
        </ReactFlowProvider>
    );
}
