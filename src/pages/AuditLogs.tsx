import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { ShieldAlert, Search, Clock, User, HardDrive } from 'lucide-react';
import { PageHeader, FilterBar, FilterGroup, ChipRow, Chip, DesktopOnly, MobileOnly, RecordCard, CardList, EmptyState } from '../components/mobile/Responsive';

export const AuditLogs: React.FC = () => {
  const { auditLogs } = useDatabase();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('All');

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'All' || log.user_role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <PageHeader
        icon={ShieldAlert}
        title="System Security & Audit Logs"
        subtitle="Immutable audit trail logging every user login, financial transaction, approval, and administrative action."
      />

      {/* Filter & Search Bar */}
      <FilterBar
        search={
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search Action, Staff Name, or Record Details..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
            />
          </div>
        }
      >
        <FilterGroup label="Filter Role">
          <ChipRow>
            {['All', 'Administrator', 'Branch Manager', 'Loan Officer', 'Auditor'].map((r) => (
              <Chip key={r} active={roleFilter === r} onClick={() => setRoleFilter(r)}>
                {r}
              </Chip>
            ))}
          </ChipRow>
        </FilterGroup>
      </FilterBar>

      {/* Audit Logs Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase text-slate-700">Recorded Audit Trail</h3>
          <span className="text-xs font-semibold text-slate-500">{filteredLogs.length} Events</span>
        </div>

        <DesktopOnly>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-100/60 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                <th className="p-4">Timestamp</th>
                <th className="p-4">User</th>
                <th className="p-4">Role</th>
                <th className="p-4">Module</th>
                <th className="p-4">Action</th>
                <th className="p-4">Details</th>
                <th className="p-4">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 whitespace-nowrap text-slate-500 font-medium">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="p-4 font-bold text-slate-900">{log.user_name}</td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      log.user_role === 'Administrator' ? 'bg-amber-100 text-amber-800' : log.user_role === 'Branch Manager' ? 'bg-indigo-100 text-indigo-800' : log.user_role === 'Auditor' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {log.user_role}
                    </span>
                  </td>
                  <td className="p-4 font-semibold text-slate-700">{log.module}</td>
                  <td className="p-4 font-bold text-chetu-blue">{log.action}</td>
                  <td className="p-4 text-slate-600 max-w-sm">{log.details}</td>
                  <td className="p-4 font-mono text-[11px] text-slate-400">{log.ip_address}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-slate-400 font-medium">
                    No audit log entries found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </DesktopOnly>

        <MobileOnly className="p-3">
          {filteredLogs.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="No audit log entries found." />
          ) : (
            <CardList>
              {filteredLogs.map((log) => (
                <RecordCard
                  key={log.id}
                  title={log.action}
                  subtitle={new Date(log.created_at).toLocaleString()}
                  badge={
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      log.user_role === 'Administrator' ? 'bg-amber-100 text-amber-800' : log.user_role === 'Branch Manager' ? 'bg-indigo-100 text-indigo-800' : log.user_role === 'Auditor' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {log.user_role}
                    </span>
                  }
                  fields={[
                    { label: 'User', value: log.user_name },
                    { label: 'Module', value: log.module },
                    { label: 'Details', value: log.details },
                    { label: 'IP Address', value: log.ip_address },
                  ]}
                />
              ))}
            </CardList>
          )}
        </MobileOnly>
      </div>
    </div>
  );
};
