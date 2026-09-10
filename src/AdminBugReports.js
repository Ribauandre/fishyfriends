import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';

const ADMIN_EMAIL = 'ribauandre@yahoo.com';

export default function AdminBugReports() {
  const { user, listBugReports } = useAuth();
  const [reports, setReports] = useState(null);

  useEffect(() => {
    let active = true;
    listBugReports().then((data) => { if (active) setReports(data); });
    return () => { active = false; };
  }, [listBugReports]);

  if (user && user.email !== ADMIN_EMAIL) return <Navigate to="/home" replace />;

  return <main className="content-shell admin-bugs-page">
    <div className="page-intro">
      <div><span className="eyebrow">ADMIN ONLY</span><h1>Bug reports</h1><p>Everything the crew's flagged from the "Report a bug" form, newest first.</p></div>
      <FishIllustration species="catfish" className="intro-sticker" />
    </div>
    <section className="table-card">
      <div className="section-heading"><div><span className="eyebrow">SUBMISSIONS</span><h2>{reports ? `${reports.length} report${reports.length === 1 ? '' : 's'}` : 'Loading...'}</h2></div></div>
      {reports === null && <p className="month-empty">Pulling reports...</p>}
      {reports && reports.length === 0 && <div className="empty-state"><FishIllustration species="catfish" className="empty-state-sticker" /><p className="month-empty">No bugs reported. Either it's flawless, or nobody's told you yet.</p></div>}
      {reports && reports.length > 0 && <ul className="bug-report-list">
        {reports.map((report) => <li key={report.id} className="bug-report-row">
          <div className="bug-report-row-meta">
            <strong>{report.angler_name}</strong>
            <span>{report.created_at ? new Date(report.created_at).toLocaleString() : ''}</span>
            {report.page_url && <span className="bug-report-page">{report.page_url}</span>}
          </div>
          <p className="bug-report-body">{report.body}</p>
        </li>)}
      </ul>}
    </section>
  </main>;
}
