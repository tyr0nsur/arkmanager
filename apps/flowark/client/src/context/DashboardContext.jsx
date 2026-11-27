import { createContext, useContext } from 'react';
import { useDashboardState } from '../hooks/useDashboardState.jsx';

// Create the Context
const DashboardContext = createContext(null);

// Create a Provider component
export function DashboardProvider({ children }) {
    const dashboardState = useDashboardState();

    return (
        <DashboardContext.Provider value={dashboardState}>
            {children}
        </DashboardContext.Provider>
    );
}

// Create a custom hook to use the context
export function useDashboard() {
    const context = useContext(DashboardContext);
    if (!context) {
        throw new Error('useDashboard must be used within a DashboardProvider');
    }
    return context;
}
