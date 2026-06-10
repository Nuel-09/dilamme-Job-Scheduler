import { Link, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import JobsPage from './pages/JobsPage';
import CreateJobPage from './pages/CreateJobPage';
import DlqPage from './pages/DlqPage';

export default function App() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <h1 className="logo">Job Scheduler</h1>
        <p className="subtitle">Stage 9 · Dilamme</p>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/jobs">Jobs</NavLink>
          <NavLink to="/create">Create Job</NavLink>
          <NavLink to="/dlq">Dead Letter Queue</NavLink>
        </nav>
        <div className="sidebar-footer">
          <Link to="/docs" className="docs-link" onClick={(e) => { e.preventDefault(); window.open('http://localhost:3000/docs', '_blank'); }}>
            API Docs ↗
          </Link>
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/create" element={<CreateJobPage />} />
          <Route path="/dlq" element={<DlqPage />} />
        </Routes>
      </main>
    </div>
  );
}
