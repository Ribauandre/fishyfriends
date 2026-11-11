import React, { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';

// The bug reports the crew has sent in, for the admin page. Who may read them all is the
// database's call (the bug_reports policy asks is_admin()); anyone else gets only their own.
export default function BugReportsSection() {
  const { listBugReports } = useAuth();
  const [reports, setReports] = useState(null);

  useEffect(() => {
    let active = true;
    listBugReports().then((data) => { if (active) setReports(data); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <section className="table-card" aria-label="Bug reports">
    <div className="section-heading"><div><span className="eyebrow">BUG REPORTS</span><h2>{reports ? `${reports.length} report${reports.length === 1 ? '' : 's'}` : 'Loading...'}</h2></div></div>
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
  </section>;
}
