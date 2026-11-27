
import React, { useState, useEffect } from 'react';
import type { Project, Priority, IssueType, Component } from './App';
import { UserSelect } from './components/UserSelect';

interface CreateIssueModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (issue: any) => Promise<void>;
    projects: Project[];
    priorities: Priority[];
    issueTypes: IssueType[];
    initialProjectKey?: string;
    users?: any[];
    statuses?: string[];
    components?: Component[];
}

const CreateIssueModal: React.FC<CreateIssueModalProps> = ({ isOpen, onClose, onCreate, projects, priorities, issueTypes, initialProjectKey, users, statuses, components }) => {
    const [summary, setSummary] = useState('');
    const [description, setDescription] = useState('');
    const [projectKey, setProjectKey] = useState(initialProjectKey || '');
    const [issueType, setIssueType] = useState(issueTypes.length > 0 ? issueTypes[0].id : 'TASK');
    const [priority, setPriority] = useState(priorities.length > 0 ? priorities[0].name : 'Medium');
    const [assignee, setAssignee] = useState('');
    const [status, setStatus] = useState('');
    const [labels, setLabels] = useState<string[]>([]);
    const [labelInput, setLabelInput] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [startDate, setStartDate] = useState('');
    const [closedDate, setClosedDate] = useState('');
    const [parentId, setParentId] = useState('');
    const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [dateError, setDateError] = useState('');

    // Update defaults when props change
    useEffect(() => {
        if (issueTypes.length > 0 && !issueType) {
            setIssueType(issueTypes[0].id);
        }
    }, [issueTypes]);

    useEffect(() => {
        if (priorities.length > 0 && !priority) {
            setPriority(priorities[0].name);
        }
    }, [priorities]);

    // Update project key if initial changes and we haven't touched it (simplified for now)
    useEffect(() => {
        if (initialProjectKey) setProjectKey(initialProjectKey);
    }, [initialProjectKey]);

    if (!isOpen) return null;

    const handleAddLabel = () => {
        const trimmed = labelInput.trim();
        if (trimmed && !labels.includes(trimmed)) {
            setLabels([...labels, trimmed]);
        }
        setLabelInput('');
    };

    const handleRemoveLabel = (label: string) => {
        setLabels(labels.filter(l => l !== label));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!summary || !projectKey) {
            alert('Summary and Project are required');
            return;
        }

        if (startDate && dueDate && startDate > dueDate) {
            setDateError('Start Date cannot be after Due Date');
            return;
        }
        setDateError('');

        // Validate self-parenting
        if (parentId) {
            // Validate circular parent-child dependencies
            try {
                const response = await fetch('./api/services/zira/state');
                if (response.ok) {
                    const data = await response.json();
                    const allIssues = data?.state?.issues || {};
                    // Check all existing issues to see if parentId matches the newly created key
                    // (can't self-parent on create, but check cycles from parentId upward)
                    const visited = new Set<string>();
                    let cur: string | null = parentId;
                    while (cur) {
                        if (visited.has(cur)) {
                            alert('Cannot set this parent: it would create a circular dependency.');
                            return;
                        }
                        visited.add(cur);
                        const parentIssue = allIssues[cur];
                        cur = parentIssue?.fields?.parent || null;
                    }
                }
            } catch (e) {
                // If we can't check, let the backend handle it
            }
        }

        setLoading(true);
        try {
            const fields: any = {
                project: projectKey,
                summary,
                description,
                issuetype: issueType,
                priority,
                assignee: assignee ? { name: assignee } : undefined,
                labels,
                components: selectedComponents,
            };
            if (status) fields.status = status;
            if (dueDate) fields.due_date = dueDate;
            if (startDate) fields.startDate = startDate;
            if (closedDate) fields.closedDate = closedDate;
            if (parentId) fields.parent = parentId;

            await onCreate(fields);
            onClose();
            // Reset form
            setSummary('');
            setDescription('');
            setAssignee('');
            setLabels([]);
            setLabelInput('');
            setDueDate('');
            setStartDate('');
            setClosedDate('');
            setParentId('');
            setSelectedComponents([]);
            setStatus('');
        } catch (error) {
            console.error('Failed to create issue', error);
            alert('Failed to create issue: ' + error);
        } finally {
            setLoading(false);
        }
    };

    const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '6px', fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.02em', textTransform: 'uppercase' };
    const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '14px', backgroundColor: '#fafbfc', outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s, background-color 0.15s' };

    // Filter components for selected project
    const projectComponents = (components || []).filter(c => c.project === projectKey);

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(2px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: 'white', width: '560px', maxWidth: '90%', maxHeight: '90vh',
                borderRadius: '14px', boxShadow: '0 20px 50px -12px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.05)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden'
            }}>
                <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em' }}>Create issue</h2>
                </div>

                <div style={{ padding: '24px 28px', overflowY: 'auto' }}>
                    <form style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        <div>
                            <label style={labelStyle}>Project <span style={{ color: '#dc2626' }}>*</span></label>
                            <select
                                value={projectKey}
                                onChange={e => setProjectKey(e.target.value)}
                                style={{ ...inputStyle, appearance: 'none', backgroundImage: 'url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 12 12%27 fill=%27%2364748b%27%3E%3Cpath d=%27M6 8L2 4h8z%27/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '12px', paddingRight: '32px' }}
                            >
                                <option value="">Select Project</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.key}>{p.name} ({p.key})</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={labelStyle}>Summary <span style={{ color: '#dc2626' }}>*</span></label>
                            <input
                                type="text"
                                value={summary}
                                onChange={e => setSummary(e.target.value)}
                                style={inputStyle}
                                placeholder="What needs to be done?"
                            />
                        </div>

                        <div>
                            <label style={labelStyle}>Description</label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                style={{ ...inputStyle, minHeight: '96px', fontFamily: 'inherit', lineHeight: 1.5 }}
                                placeholder="Describe the issue..."
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '14px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={labelStyle}>Issue Type</label>
                                <select
                                    value={issueType}
                                    onChange={e => setIssueType(e.target.value)}
                                    style={inputStyle}
                                >
                                    {issueTypes.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ flex: 1 }}>
                                <label style={labelStyle}>Priority</label>
                                <select
                                    value={priority}
                                    onChange={e => setPriority(e.target.value)}
                                    style={inputStyle}
                                >
                                    {priorities.map(p => (
                                        <option key={p.id} value={p.name}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {statuses && statuses.length > 0 && (
                            <div>
                                <label style={labelStyle}>Status</label>
                                <select
                                    value={status}
                                    onChange={e => setStatus(e.target.value)}
                                    style={inputStyle}
                                >
                                    <option value="">Default (Open)</option>
                                    {statuses.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <label style={labelStyle}>Assignee</label>
                            <UserSelect
                                users={users || []}
                                value={assignee}
                                onChange={setAssignee}
                                placeholder="Select assignee (optional)"
                            />
                        </div>

                        {/* Labels */}
                        <div>
                            <label style={labelStyle}>Labels</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: labels.length > 0 ? '10px' : '0' }}>
                                {labels.map(label => (
                                    <span key={label} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        padding: '3px 4px 3px 10px', backgroundColor: '#fef3c7', color: '#854d0e',
                                        borderRadius: '999px', fontSize: '12px', fontWeight: 500, lineHeight: 1.4
                                    }}>
                                        {label}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveLabel(label)}
                                            style={{ border: 'none', background: 'rgba(133, 77, 14, 0.12)', cursor: 'pointer', color: '#854d0e', fontSize: '11px', padding: 0, lineHeight: 1, width: '16px', height: '16px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                        >×</button>
                                    </span>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <input
                                    type="text"
                                    value={labelInput}
                                    onChange={e => setLabelInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLabel(); } }}
                                    placeholder="Add a label..."
                                    style={{ ...inputStyle, padding: '8px 12px', fontSize: '13px' }}
                                />
                                <button type="button" onClick={handleAddLabel} style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: 'white', cursor: 'pointer', color: '#475569', fontSize: '13px', fontWeight: 500 }}>Add</button>
                            </div>
                        </div>

                        {/* Due Date and Start Date */}
                        <div style={{ display: 'flex', gap: '14px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={labelStyle}>Due Date</label>
                                <input
                                    type="date"
                                    value={dueDate}
                                    onChange={e => { setDueDate(e.target.value); if (dateError) setDateError(''); }}
                                    style={inputStyle}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={labelStyle}>Start Date</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={e => { setStartDate(e.target.value); if (dateError) setDateError(''); }}
                                    style={inputStyle}
                                />
                            </div>
                        </div>
                        {dateError && (
                            <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '-10px', fontWeight: 500 }}>
                                {dateError}
                            </div>
                        )}

                        {/* Components */}
                        {projectComponents.length > 0 && (
                            <div>
                                <label style={labelStyle}>Components</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {projectComponents.map(comp => (
                                        <label key={comp.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#1e293b', cursor: 'pointer', padding: '4px 0' }}>
                                            <input
                                                type="checkbox"
                                                style={{ accentColor: '#CA8A04', width: '15px', height: '15px' }}
                                                checked={selectedComponents.includes(comp.id)}
                                                onChange={e => {
                                                    if (e.target.checked) {
                                                        setSelectedComponents([...selectedComponents, comp.id]);
                                                    } else {
                                                        setSelectedComponents(selectedComponents.filter(c => c !== comp.id));
                                                    }
                                                }}
                                            />
                                            {comp.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Parent Issue */}
                        <div>
                            <label style={labelStyle}>Parent Issue <span style={{ textTransform: 'none', fontWeight: 400, color: '#94a3b8' }}>(for subtasks)</span></label>
                            <input
                                type="text"
                                value={parentId}
                                onChange={e => setParentId(e.target.value)}
                                placeholder="e.g., ISSUE-1"
                                style={inputStyle}
                            />
                        </div>

                    </form>
                </div>

                <div style={{ padding: '16px 28px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: '#fafbfc' }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '9px 16px', border: 'none', background: 'transparent', color: '#475569', fontWeight: 500, fontSize: '14px', cursor: 'pointer', borderRadius: '8px' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        style={{
                            padding: '9px 18px', border: 'none', borderRadius: '8px',
                            backgroundColor: '#CA8A04', color: 'white', fontWeight: 600, fontSize: '14px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.6 : 1,
                            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
                            transition: 'background-color 0.15s, transform 0.05s'
                        }}
                    >
                        {loading ? 'Creating...' : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateIssueModal;
