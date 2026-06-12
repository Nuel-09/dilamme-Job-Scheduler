import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import { JobEventsProvider } from './context/JobEventsContext';
import Dashboard from './pages/Dashboard';
import JobsPage from './pages/JobsPage';
import CreateJobPage from './pages/CreateJobPage';
import DlqPage from './pages/DlqPage';

export default function App() {
  return (
    <JobEventsProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/create" element={<CreateJobPage />} />
          <Route path="/dlq" element={<DlqPage />} />
        </Routes>
      </Layout>
    </JobEventsProvider>
  );
}
