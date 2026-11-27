import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Issue, Priority, IssueType, Component, Version } from '../App';
import { UserSelect } from './UserSelect';

interface Attachment {
    id: string;
    filename: string;
    fileSize?: number;
    mimeType?: string;
    created?: string;
    parentId?: string;
}

interface IssueLinkType {
    id: string;
    name: string;
}

interface IssueDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    issue: Issue | null;
    onUpdate: (issueId: string, fields: any) => Promise<void>;
    onDelete?: (issueId: string) => Promise<void>;
    priorities: Priority[];
    issueTypes: IssueType[];
    statuses: string[];
    users?: any[];
    callTool?: (fn: string, params: any) => Promise<any>;
    components?: Component[];
    versions?: Version[];
}

const IssueDetailModal = ({
    isOpen, onClose, issue, onUpdate, onDelete, priorities, issueTypes, statuses, users, callTool, components, versions
}: IssueDetailModalProps) => {
    const [summary, setSummary] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState('');
    const [status, setStatus] = useState('');
    const [assignee, setAssignee] = useState('');
    const [issueType, setIssueType] = useState('');
    const [labels, setLabels] = useState<string[]>([]);
    const [labelInput, setLabelInput] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [startDate, setStartDate] = useState('');
    const [closedDate, setClosedDate] = useState('');
    const [resolution, setResolution] = useState('');
    const [parentId, setParentId] = useState('');
    const [issueComponents, setIssueComponents] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    // Attachments state
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [attachmentsLoading, setAttachmentsLoading] = useState(false);
    const [uploadFileName, setUploadFileName] = useState('');

    // Issue Linking state
    const [showLinkDialog, setShowLinkDialog] = useState(false);
    const [linkTypes, setLinkTypes] = useState<IssueLinkType[]>([]);
    const [selectedLinkType, setSelectedLinkType] = useState('');
    const [linkTargetKey, setLinkTargetKey] = useState('');
    const [linkDirection, setLinkDirection] = useState<'outward' | 'inward'>('outward');
    const [linkLoading, setLinkLoading] = useState(false);
    const [linkedIssues, setLinkedIssues] = useState<any[]>([]);

    // Issue picker state
    const [pickerQuery, setPickerQuery] = useState('');
    const [pickerResults, setPickerResults] = useState<string[]>([]);
    const [pickerLoading, setPickerLoading] = useState(false);

    // Resolutions state
    const [resolutions, setResolutions] = useState<any[]>([]);

    // Active tab
    const [activeTab, setActiveTab] = useState<'details' | 'attachments' | 'links'>('details');

    // Escape key handler
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (issue) {
            setSummary(issue.fields.summary || '');
            setDescription(issue.fields.description || '');
            const getFieldVal = (val: any) => typeof val === 'object' && val !== null ? val.name : val;
            setPriority(getFieldVal(issue.fields.priority) || 'Low');
            setStatus(getFieldVal(issue.fields.status) || 'Open');
            setAssignee(issue.fields.assignee?.name || '');
            const rawType = getFieldVal(issue.fields.issuetype) || 'TASK';
            const matchedType = issueTypes.find(t => t.id === rawType || t.name === rawType);
            setIssueType(matchedType ? matchedType.id : rawType.toUpperCase());
            setLabels(issue.fields.labels || []);
            setDueDate(issue.fields.due_date || '');
            setStartDate(issue.fields.startDate || '');
            setClosedDate(issue.fields.closedDate || '');
            setResolution(issue.fields.resolution || '');
            setParentId(issue.fields.parent || '');
            setIssueComponents(issue.fields.components || []);
            setActiveTab('details');

            // Load attachments and linked issues
            if (callTool) {
                loadAttachments();
                loadLinkedIssues();
                loadResolutions();
            }
        }
    }, [issue]);

    const loadResolutions = async () => {
        if (!callTool) return;
        try {
            const result = await callTool('get_all_resolutions', {});
            if (result && result.resolutions) {
                setResolutions(result.resolutions);
            }
        } catch (e) {
            // ignore
        }
    };

    const loadAttachments = async () => {
        if (!callTool || !issue) return;
        setAttachmentsLoading(true);
        try {
            const result = await callTool('list_issue_attachments', { issue_id_or_key: issue.key || issue.id });
            if (Array.isArray(result)) {
                setAttachments(result);
            } else {
                setAttachments([]);
            }
        } catch (e) {
            console.error('Failed to load attachments:', e);
            setAttachments([]);
        } finally {
            setAttachmentsLoading(false);
        }
    };

    const loadLinkedIssues = async () => {
        if (!issue) return;
        try {
            // The backend has no "get links for issue" API endpoint.
            // Issue links are stored in a separate DB collection not returned by get_issue_by_id.
            // Fetch the raw DB state which includes the issue_links collection.
            const response = await fetch('./api/services/zira/state');
            if (!response.ok) return;
            const data = await response.json();
            const allLinks = data?.state?.issue_links || [];
            const issueKey = issue.key || issue.id;
            // Filter for links where this issue is either the inward or outward issue
            const relevantLinks = allLinks.filter((link: any) =>
                link?.inwardIssue?.key === issueKey || link?.outwardIssue?.key === issueKey
            );
            setLinkedIssues(relevantLinks);
        } catch (e) {
            console.error('Failed to load issue links:', e);
        }
    };

    const handleUploadAttachment = async () => {
        if (!callTool || !issue || !uploadFileName) return;
        try {
            await callTool('add_attachment', { issue_id_or_key: issue.key || issue.id, file_path: uploadFileName });
            setUploadFileName('');
            loadAttachments();
        } catch (e) {
            console.error('Failed to upload attachment:', e);
            alert('Failed to upload attachment: ' + e);
        }
    };

    const handleDeleteAttachment = async (attId: string) => {
        if (!callTool) return;
        if (!confirm('Delete this attachment?')) return;
        try {
            await callTool('delete_attachment', { id: attId });
            loadAttachments();
        } catch (e) {
            console.error('Failed to delete attachment:', e);
            alert('Failed to delete attachment: ' + e);
        }
    };

    const handleDownloadAttachment = async (attId: string) => {
        if (!callTool) return;
        try {
            const result = await callTool('download_attachment', { id: attId });
            alert('Download initiated: ' + JSON.stringify(result));
        } catch (e) {
            console.error('Failed to download attachment:', e);
            alert('Failed to download: ' + e);
        }
    };

    const handleGetAttachmentContent = async (attId: string) => {
        if (!callTool) return;
        try {
            const result = await callTool('get_attachment_content', { id: attId });
            alert('Content: ' + JSON.stringify(result));
        } catch (e) {
            alert('Failed to get content: ' + e);
        }
    };

    const handleGetAttachmentMetadata = async (attId: string) => {
        if (!callTool) return;
        try {
            const result = await callTool('get_attachment_metadata', { id: attId });
            alert('Metadata: ' + JSON.stringify(result, null, 2));
        } catch (e) {
            alert('Failed to get metadata: ' + e);
        }
    };

    const openLinkDialog = async () => {
        if (!callTool) return;
        setShowLinkDialog(true);
        try {
            const result = await callTool('get_all_issue_link_types', {});
            if (result && result.issueLinkTypes) {
                setLinkTypes(result.issueLinkTypes);
                if (result.issueLinkTypes.length > 0) {
                    setSelectedLinkType(result.issueLinkTypes[0].name);
                }
            }
        } catch (e) {
            console.error('Failed to load link types:', e);
        }
    };

    const handleSearchIssuePicker = async () => {
        if (!callTool || !pickerQuery) return;
        setPickerLoading(true);
        try {
            const result = await callTool('search_issues_for_picker', { query: pickerQuery, currentIssueKey: issue?.key });
            if (result && result.sections) {
                const keys: string[] = [];
                result.sections.forEach((s: any) => {
                    if (s.issues) s.issues.forEach((i: any) => keys.push(i.key || i));
                });
                setPickerResults(keys);
            } else if (Array.isArray(result)) {
                setPickerResults(result);
            } else {
                setPickerResults([]);
            }
        } catch (e) {
            setPickerResults([]);
        } finally {
            setPickerLoading(false);
        }
    };

    const handleCreateIssueLink = async () => {
        if (!callTool || !issue || !linkTargetKey || !selectedLinkType) return;
        setLinkLoading(true);
        try {
            const currentIssueKey = issue.key || issue.id;
            const inwardIssue = linkDirection === 'inward' ? { key: currentIssueKey } : { key: linkTargetKey };
            const outwardIssue = linkDirection === 'inward' ? { key: linkTargetKey } : { key: currentIssueKey };
            const result = await callTool('create_issue_link', {
                type: selectedLinkType,
                inwardIssue,
                outwardIssue
            });
            // Reload links from backend state after creation
            await loadLinkedIssues();
            setShowLinkDialog(false);
            setLinkTargetKey('');
            setPickerResults([]);
            setPickerQuery('');
        } catch (e) {
            console.error('Failed to create issue link:', e);
            alert('Failed to create issue link: ' + e);
        } finally {
            setLinkLoading(false);
        }
    };

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

    if (!isOpen || !issue) return null;

    const handleSave = async () => {
        // Validate start date vs due date
        if (startDate && dueDate && startDate > dueDate) {
            alert('Start Date cannot be after Due Date');
            return;
        }
        // Validate self-parenting
        const currentKey = issue.key || issue.id;
        if (parentId && (parentId === issue.id || parentId === currentKey)) {
            alert('An issue cannot be its own parent.');
            return;
        }
        // Validate circular parent-child dependencies
        if (parentId) {
            try {
                const response = await fetch('./api/services/zira/state');
                if (response.ok) {
                    const data = await response.json();
                    const allIssues = data?.state?.issues || {};
                    const visited = new Set<string>([issue.id, currentKey]);
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
                summary,
                description,
                priority,
                status,
                assignee: { name: assignee || 'Unassigned' },
                issuetype: issueType,
                labels,
                components: issueComponents,
            };
            if (dueDate) fields.due_date = dueDate;
            else fields.due_date = null;
            if (startDate) fields.startDate = startDate;
            else fields.startDate = null;
            if (closedDate) fields.closedDate = closedDate;
            else fields.closedDate = null;
            if (resolution) fields.resolution = resolution;
            else fields.resolution = null;
            if (parentId) fields.parent = parentId;
            else fields.parent = null;

            await onUpdate(issue.id, fields);
            onClose();
        } catch (error) {
            console.error('Failed to update issue', error);
            alert('Failed to update issue: ' + error);
        } finally {
            setLoading(false);
        }
    };

    const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 600, fontSize: '11px', color: '#64748b', marginBottom: '6px', letterSpacing: '0.02em', textTransform: 'uppercase' };
    const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#fafbfc', color: '#1e293b', fontSize: '13.5px', outline: 'none', boxSizing: 'border-box' };
    const tabStyle = (active: boolean): React.CSSProperties => ({
        padding: '12px 4px', marginRight: '24px', cursor: 'pointer',
        color: active ? '#0f172a' : '#64748b', fontWeight: active ? 600 : 500, fontSize: '13.5px', background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid #CA8A04' : '2px solid transparent',
        marginBottom: '-1px',
        transition: 'color 0.15s, border-color 0.15s'
    });

    const getUserDisplayName = (username: string) => {
        if (!username || username === 'Unassigned') return 'Unassigned';
        const user = (users || []).find((u: any) => u.name === username);
        return user?.displayName || username;
    };

    const issueTypeName = (typeof issue.fields.issuetype === 'string' ? issue.fields.issuetype : issue.fields.issuetype?.name) || 'Task';
    const tLow = issueTypeName.toLowerCase();
    let typeBg = '#dbeafe', typeFg = '#1e40af';
    if (tLow === 'bug') { typeBg = '#fee2e2'; typeFg = '#991b1b'; }
    else if (tLow.includes('story')) { typeBg = '#dcfce7'; typeFg = '#166534'; }
    else if (tLow.includes('epic')) { typeBg = '#ede9fe'; typeFg = '#6d28d9'; }

    return createPortal(
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(2px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 10000
        }}>
            <div style={{
                backgroundColor: 'white', width: '960px', maxWidth: '92%', maxHeight: '92vh',
                borderRadius: '14px', boxShadow: '0 24px 60px -12px rgba(15, 23, 42, 0.4), 0 0 0 1px rgba(15, 23, 42, 0.05)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{ padding: '18px 28px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: typeBg, color: typeFg, padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.02em' }}>
                            {issueTypeName}
                        </span>
                        <span style={{ fontSize: '13.5px', color: '#475569', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 500 }}>{issue.key || issue.id}</span>
                        <span style={{ fontSize: '10.5px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#cbd5e1' }}>[{issue.id}]</span>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: '#475569', padding: '6px 10px', borderRadius: '7px', fontWeight: 500 }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        Close
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', padding: '0 28px' }}>
                    <button style={tabStyle(activeTab === 'details')} onClick={() => setActiveTab('details')}>Details</button>
                    <button style={tabStyle(activeTab === 'attachments')} onClick={() => setActiveTab('attachments')}>Attachments {attachments.length > 0 && <span style={{ marginLeft: '4px', backgroundColor: '#f1f5f9', color: '#475569', padding: '1px 7px', borderRadius: '999px', fontSize: '11px', fontWeight: 600 }}>{attachments.length}</span>}</button>
                    <button style={tabStyle(activeTab === 'links')} onClick={() => setActiveTab('links')}>Links {linkedIssues.length > 0 && <span style={{ marginLeft: '4px', backgroundColor: '#f1f5f9', color: '#475569', padding: '1px 7px', borderRadius: '999px', fontSize: '11px', fontWeight: 600 }}>{linkedIssues.length}</span>}</button>
                </div>

                {/* Body */}
                <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1, backgroundColor: '#fafbfc' }}>
                    {activeTab === 'details' && (
                        <div style={{ display: 'flex', gap: '28px' }}>
                            {/* Main Content */}
                            <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div>
                                    <input
                                        type="text"
                                        value={summary}
                                        onChange={e => setSummary(e.target.value)}
                                        style={{
                                            fontSize: '22px', fontWeight: 600, color: '#0f172a', border: '1px solid transparent',
                                            padding: '6px 10px', width: '100%', borderRadius: '8px', backgroundColor: 'transparent',
                                            letterSpacing: '-0.015em', lineHeight: 1.3, outline: 'none', boxSizing: 'border-box'
                                        }}
                                        onFocus={(e) => { e.target.style.borderColor = '#CA8A04'; e.target.style.backgroundColor = 'white'; e.target.style.boxShadow = '0 0 0 3px rgba(202, 138, 4, 0.12)'; }}
                                        onBlur={(e) => { e.target.style.borderColor = 'transparent'; e.target.style.backgroundColor = 'transparent'; e.target.style.boxShadow = 'none'; }}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Description</label>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        style={{
                                            width: '100%', minHeight: '220px', padding: '14px 16px', borderRadius: '10px',
                                            border: '1px solid #e2e8f0', resize: 'vertical', fontFamily: 'inherit', color: '#1e293b',
                                            backgroundColor: 'white', fontSize: '14px', lineHeight: 1.55, outline: 'none', boxSizing: 'border-box'
                                        }}
                                        placeholder="Add a description..."
                                    />
                                </div>

                                {/* Labels */}
                                <div>
                                    <label style={labelStyle}>Labels</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                                        {labels.map(label => (
                                            <span key={label} style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                padding: '3px 4px 3px 10px', backgroundColor: '#fef3c7', color: '#854d0e',
                                                borderRadius: '999px', fontSize: '12px', fontWeight: 500
                                            }}>
                                                {label}
                                                <button
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
                                            style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '13px', backgroundColor: 'white', outline: 'none' }}
                                        />
                                        <button onClick={handleAddLabel} style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: 'white', cursor: 'pointer', color: '#475569', fontSize: '13px', fontWeight: 500 }}>Add</button>
                                    </div>
                                </div>
                            </div>

                            {/* Sidebar */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: 'white', padding: '18px', borderRadius: '12px', alignSelf: 'flex-start', boxShadow: '0 0 0 1px #f1f5f9' }}>
                                <div>
                                    <label style={labelStyle}>Status</label>
                                    <select
                                        value={status}
                                        onChange={e => setStatus(e.target.value)}
                                        style={inputStyle}
                                    >
                                        {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Issue Type</label>
                                    <select
                                        value={issueType}
                                        onChange={e => setIssueType(e.target.value)}
                                        style={inputStyle}
                                    >
                                        {issueTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Priority</label>
                                    <select
                                        value={priority}
                                        onChange={e => setPriority(e.target.value)}
                                        style={inputStyle}
                                    >
                                        {priorities.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Assignee</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: '#f1f5f9', overflow: 'hidden', flexShrink: 0 }}>
                                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${assignee || 'Unassigned'}`} alt="" width="26" height="26" />
                                        </div>
                                        <span style={{ color: getUserDisplayName(assignee) === 'Unassigned' ? '#94a3b8' : '#1e293b', fontWeight: 500, fontSize: '13.5px' }}>{getUserDisplayName(assignee)}</span>
                                    </div>
                                    <UserSelect
                                        users={users || []}
                                        value={assignee}
                                        onChange={setAssignee}
                                        placeholder="Change assignee"
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Due Date</label>
                                    <input
                                        type="date"
                                        value={dueDate}
                                        onChange={e => setDueDate(e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Start Date</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={e => setStartDate(e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Closed Date</label>
                                    <input
                                        type="date"
                                        value={closedDate}
                                        onChange={e => setClosedDate(e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Resolution</label>
                                    <select
                                        value={resolution}
                                        onChange={e => setResolution(e.target.value)}
                                        style={inputStyle}
                                    >
                                        <option value="">None</option>
                                        {resolutions.map((r: any) => (
                                            <option key={r.id} value={r.id}>{r.name} ({r.id})</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Parent Issue</label>
                                    <input
                                        type="text"
                                        value={parentId}
                                        onChange={e => setParentId(e.target.value)}
                                        placeholder="e.g., ISSUE-1"
                                        style={inputStyle}
                                    />
                                </div>
                                {components && components.length > 0 && (
                                    <div>
                                        <label style={labelStyle}>Components</label>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {components.map(comp => (
                                                <label key={comp.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#1e293b', cursor: 'pointer', padding: '2px 0' }}>
                                                    <input
                                                        type="checkbox"
                                                        style={{ accentColor: '#CA8A04', width: '14px', height: '14px' }}
                                                        checked={issueComponents.includes(comp.id)}
                                                        onChange={e => {
                                                            if (e.target.checked) {
                                                                setIssueComponents([...issueComponents, comp.id]);
                                                            } else {
                                                                setIssueComponents(issueComponents.filter(c => c !== comp.id));
                                                            }
                                                        }}
                                                    />
                                                    {comp.name}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div style={{ fontSize: '11.5px', color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: '14px', marginTop: '4px', lineHeight: 1.6 }}>
                                    <div><span style={{ color: '#cbd5e1' }}>Created</span> · {issue.fields.created}</div>
                                    <div><span style={{ color: '#cbd5e1' }}>Updated</span> · {issue.fields.updated}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'attachments' && (
                        <div>
                            {/* Upload */}
                            <div style={{ marginBottom: '20px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input
                                    type="text"
                                    value={uploadFileName}
                                    onChange={e => setUploadFileName(e.target.value)}
                                    placeholder="File path to attach..."
                                    style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', backgroundColor: 'white', fontSize: '13.5px', outline: 'none' }}
                                />
                                <button
                                    onClick={handleUploadAttachment}
                                    disabled={!uploadFileName}
                                    style={{
                                        padding: '9px 18px', border: 'none', borderRadius: '8px',
                                        backgroundColor: '#CA8A04', color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '14px',
                                        opacity: !uploadFileName ? 0.4 : 1, boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
                                    }}
                                >
                                    Attach
                                </button>
                            </div>

                            {attachmentsLoading ? (
                                <div style={{ color: '#94a3b8', padding: '32px', textAlign: 'center', fontSize: '14px' }}>Loading attachments...</div>
                            ) : attachments.length === 0 ? (
                                <div style={{ color: '#94a3b8', padding: '48px 16px', textAlign: 'center', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 0 0 1px #f1f5f9', fontSize: '14px' }}>
                                    <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.4 }}>📎</div>
                                    <div style={{ fontWeight: 500, color: '#475569' }}>No attachments yet</div>
                                </div>
                            ) : (
                                <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 0 0 1px #f1f5f9', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: '#fafbfc' }}>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11.5px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Filename</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11.5px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Size</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11.5px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Created</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '11.5px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {attachments.map((att, idx) => (
                                            <tr key={att.id} style={{ borderTop: idx === 0 ? 'none' : '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '12px 14px', color: '#0f172a', fontSize: '13.5px', fontWeight: 500 }}>{att.filename}<span style={{ marginLeft: '6px', fontSize: '10.5px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#cbd5e1', fontWeight: 400 }}>[{att.id}]</span></td>
                                                <td style={{ padding: '12px 14px', color: '#475569', fontSize: '13px' }}>{att.fileSize ? `${Math.round(att.fileSize / 1024)} KB` : '—'}</td>
                                                <td style={{ padding: '12px 14px', color: '#475569', fontSize: '13px' }}>{att.created ? new Date(att.created).toLocaleDateString() : '—'}</td>
                                                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                                                        <button onClick={() => handleDownloadAttachment(att.id)} style={{ padding: '4px 10px', fontSize: '11.5px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: 'white', color: '#475569', cursor: 'pointer', fontWeight: 500 }}>Download</button>
                                                        <button onClick={() => handleGetAttachmentContent(att.id)} style={{ padding: '4px 10px', fontSize: '11.5px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: 'white', color: '#475569', cursor: 'pointer', fontWeight: 500 }}>Content</button>
                                                        <button onClick={() => handleGetAttachmentMetadata(att.id)} style={{ padding: '4px 10px', fontSize: '11.5px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: 'white', color: '#475569', cursor: 'pointer', fontWeight: 500 }}>Info</button>
                                                        <button onClick={() => handleDeleteAttachment(att.id)} style={{ padding: '4px 10px', fontSize: '11.5px', border: '1px solid #fecaca', borderRadius: '6px', backgroundColor: 'transparent', color: '#dc2626', cursor: 'pointer', fontWeight: 500 }}>Delete</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'links' && (
                        <div>
                            <div style={{ marginBottom: '16px' }}>
                                <button
                                    onClick={openLinkDialog}
                                    style={{
                                        padding: '9px 18px', border: 'none', borderRadius: '8px',
                                        backgroundColor: '#CA8A04', color: 'white', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                                        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
                                    }}
                                >
                                    Link Issue
                                </button>
                            </div>

                            {linkedIssues.length === 0 ? (
                                <div style={{ color: '#94a3b8', padding: '48px 16px', textAlign: 'center', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 0 0 1px #f1f5f9', fontSize: '14px' }}>
                                    <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.4 }}>🔗</div>
                                    <div style={{ fontWeight: 500, color: '#475569' }}>No linked issues</div>
                                </div>
                            ) : (
                                <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 0 0 1px #f1f5f9', overflow: 'hidden' }}>
                                    {linkedIssues.map((link: any, idx: number) => {
                                        const linkType = typeof link.type === 'object' ? link.type.name : link.type;
                                        const currentKey = issue.key || issue.id;
                                        const isInward = link.inwardIssue?.key === currentKey;
                                        const otherKey = isInward ? link.outwardIssue?.key : link.inwardIssue?.key;
                                        return (
                                            <div key={link.id || idx} style={{ padding: '12px 16px', borderTop: idx === 0 ? 'none' : '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span style={{ color: '#64748b', fontSize: '12.5px', minWidth: '140px', fontWeight: 500 }}>
                                                    {linkType || 'Related'}
                                                </span>
                                                <span style={{ color: '#CA8A04', fontWeight: 600, fontSize: '14px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                                                    {otherKey || link.inwardIssue?.key || link.outwardIssue?.key || 'Unknown'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Link Issue Dialog */}
                            {showLinkDialog && (
                                <div style={{ marginTop: '20px', padding: '20px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 0 0 1px #f1f5f9' }}>
                                    <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', color: '#0f172a', fontWeight: 600, letterSpacing: '-0.01em' }}>Link an Issue</h3>
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Link Type</label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <select
                                                value={selectedLinkType}
                                                onChange={e => setSelectedLinkType(e.target.value)}
                                                style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', backgroundColor: '#fafbfc', fontSize: '13.5px' }}
                                            >
                                                {linkTypes.map(lt => (
                                                    <option key={lt.id} value={lt.name}>{lt.name}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={linkDirection}
                                                onChange={e => setLinkDirection(e.target.value as 'inward' | 'outward')}
                                                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', backgroundColor: '#fafbfc', fontSize: '13.5px' }}
                                            >
                                                <option value="outward">Outward</option>
                                                <option value="inward">Inward</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Search Issue</label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input
                                                type="text"
                                                value={pickerQuery}
                                                onChange={e => setPickerQuery(e.target.value)}
                                                placeholder="Search by key or summary..."
                                                style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', backgroundColor: '#fafbfc', fontSize: '13.5px' }}
                                                onKeyDown={e => e.key === 'Enter' && handleSearchIssuePicker()}
                                            />
                                            <button onClick={handleSearchIssuePicker} disabled={pickerLoading} style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: 'white', cursor: 'pointer', color: '#475569', fontSize: '13px', fontWeight: 500 }}>
                                                {pickerLoading ? '...' : 'Search'}
                                            </button>
                                        </div>
                                        {pickerResults.length > 0 && (
                                            <div style={{ marginTop: '6px', border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '140px', overflowY: 'auto', backgroundColor: 'white' }}>
                                                {pickerResults.map(key => (
                                                    <div
                                                        key={key}
                                                        onClick={() => { setLinkTargetKey(key); setPickerResults([]); }}
                                                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: '#1e293b', borderBottom: '1px solid #f1f5f9', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                                                        onMouseEnter={e => (e.target as HTMLDivElement).style.backgroundColor = '#fefce8'}
                                                        onMouseLeave={e => (e.target as HTMLDivElement).style.backgroundColor = 'transparent'}
                                                    >
                                                        {key}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Target Issue Key</label>
                                        <input
                                            type="text"
                                            value={linkTargetKey}
                                            onChange={e => setLinkTargetKey(e.target.value)}
                                            placeholder="e.g., PROJ-123"
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', backgroundColor: '#fafbfc', fontSize: '13.5px', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                        <button onClick={() => { setShowLinkDialog(false); setLinkTargetKey(''); setPickerResults([]); setPickerQuery(''); }} style={{ padding: '8px 14px', border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer', fontWeight: 500, fontSize: '13.5px', borderRadius: '8px' }}>Cancel</button>
                                        <button onClick={handleCreateIssueLink} disabled={linkLoading || !linkTargetKey} style={{
                                            padding: '8px 18px', border: 'none', borderRadius: '8px', backgroundColor: '#CA8A04', color: 'white', fontWeight: 600, fontSize: '13.5px', cursor: 'pointer',
                                            opacity: linkLoading || !linkTargetKey ? 0.5 : 1
                                        }}>
                                            {linkLoading ? 'Linking...' : 'Link'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 28px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white' }}>
                    {onDelete && (
                        <button
                            onClick={async () => {
                                if (confirm(`Are you sure you want to delete issue "${issue.key || issue.id}"? This cannot be undone.`)) {
                                    try {
                                        await onDelete(issue.id);
                                        onClose();
                                    } catch (error) {
                                        console.error('Failed to delete issue', error);
                                        alert('Failed to delete issue');
                                    }
                                }
                            }}
                            style={{
                                padding: '8px 14px', border: '1px solid #fecaca', borderRadius: '8px',
                                backgroundColor: 'transparent', color: '#dc2626', cursor: 'pointer', fontWeight: 500, fontSize: '13.5px',
                                transition: 'background-color 0.12s'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fef2f2'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                            Delete Issue
                        </button>
                    )}
                    <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                        <button
                            onClick={onClose}
                            style={{ padding: '9px 16px', border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer', fontWeight: 500, fontSize: '14px', borderRadius: '8px' }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            style={{
                                padding: '9px 20px', border: 'none', borderRadius: '8px',
                                backgroundColor: '#CA8A04', color: 'white', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                                opacity: loading ? 0.6 : 1, boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
                            }}
                        >
                            {loading ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default IssueDetailModal;
