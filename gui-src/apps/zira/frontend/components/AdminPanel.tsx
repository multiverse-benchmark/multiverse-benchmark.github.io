import React, { useState, useEffect } from 'react';

interface AdminPanelProps {
    callTool: (fn: string, params: any) => Promise<any>;
}

type AdminSection = 'statuses' | 'status-categories' | 'roles' | 'permissions' | 'my-permissions' | 'permission-schemes' | 'resolutions' | 'webhooks' | 'settings' | 'user-preferences' | 'license' | 'reindex' | 'app-roles' | 'app-properties' | 'security-levels' | 'issue-types' | 'avatars' | 'jql' | 'server-info' | 'project-categories' | 'issue-link-types';

const SECTIONS: { id: AdminSection; label: string }[] = [
    { id: 'statuses', label: 'Statuses' },
    { id: 'status-categories', label: 'Status Categories' },
    { id: 'roles', label: 'Roles' },
    { id: 'permissions', label: 'Permissions' },
    { id: 'my-permissions', label: 'My Permissions' },
    { id: 'permission-schemes', label: 'Permission Schemes' },
    { id: 'resolutions', label: 'Resolutions' },
    { id: 'issue-types', label: 'Issue Types' },
    { id: 'issue-link-types', label: 'Issue Link Types' },
    { id: 'project-categories', label: 'Project Categories' },
    { id: 'security-levels', label: 'Security Levels' },
    { id: 'webhooks', label: 'Webhooks' },
    { id: 'settings', label: 'Settings' },
    { id: 'user-preferences', label: 'User Preferences' },
    { id: 'app-properties', label: 'Application Properties' },
    { id: 'app-roles', label: 'Application Roles' },
    { id: 'server-info', label: 'Server Info' },
    { id: 'license', label: 'License' },
    { id: 'reindex', label: 'Reindex' },
    { id: 'jql', label: 'JQL Autocomplete' },
    { id: 'avatars', label: 'Avatars' },
];

const AdminPanel = ({ callTool }: AdminPanelProps) => {
    const [activeSection, setActiveSection] = useState<AdminSection>('statuses');
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form states for interactive sections
    const [formInputs, setFormInputs] = useState<Record<string, string>>({});

    const loadSection = async (section: AdminSection) => {
        setLoading(true);
        setError(null);
        setData(null);
        try {
            let result: any;
            switch (section) {
                case 'statuses':
                    result = await callTool('get_all_statuses', {});
                    break;
                case 'status-categories':
                    result = await callTool('get_all_status_categories', {});
                    break;
                case 'roles':
                    result = await callTool('get_all_roles', {});
                    break;
                case 'permissions':
                    result = await callTool('get_all_permissions', {});
                    break;
                case 'my-permissions':
                    result = await callTool('get_current_user_permissions', {});
                    break;
                case 'permission-schemes':
                    result = await callTool('get_all_permission_schemes', {});
                    break;
                case 'resolutions':
                    result = await callTool('get_all_resolutions', {});
                    break;
                case 'webhooks':
                    result = await callTool('get_all_webhooks', {});
                    break;
                case 'settings':
                    result = await callTool('get_all_settings', {});
                    break;
                case 'user-preferences':
                    result = await callTool('get_current_user_preferences', {});
                    break;
                case 'app-roles':
                    result = await callTool('get_application_roles', {});
                    break;
                case 'app-properties':
                    result = await callTool('get_application_properties', {});
                    break;
                case 'security-levels':
                    result = await callTool('get_all_security_levels', {});
                    break;
                case 'issue-types':
                    result = await callTool('get_all_issue_types', {});
                    break;
                case 'issue-link-types':
                    result = await callTool('get_all_issue_link_types', {});
                    break;
                case 'project-categories':
                    result = await callTool('get_all_project_categories', {});
                    break;
                case 'server-info':
                    result = await callTool('get_server_info', {});
                    break;
                case 'license':
                    result = { message: 'Enter a license key to validate' };
                    break;
                case 'reindex':
                    result = await callTool('get_reindex_status', {});
                    break;
                case 'jql':
                    result = await callTool('get_jql_autocomplete_suggestions', {});
                    break;
                case 'avatars':
                    result = { message: 'Use the forms below to manage avatars' };
                    break;
            }
            setData(result);
        } catch (e: any) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSection(activeSection);
    }, [activeSection]);

    const handleSectionClick = (section: AdminSection) => {
        setActiveSection(section);
        setFormInputs({});
    };

    // Action handlers for interactive sections
    const handleStatusById = async () => {
        const id = formInputs['statusId'];
        if (!id) return;
        try {
            const result = await callTool('get_status_by_id', { status_id: id });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleStatusCategoryById = async () => {
        const id = formInputs['statusCatId'];
        if (!id) return;
        try {
            const result = await callTool('get_status_category_by_id', { cat_id: id });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleRoleById = async () => {
        const id = formInputs['roleId'];
        if (!id) return;
        try {
            const result = await callTool('get_role_by_id', { role_id: id });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handlePermissionSchemeById = async () => {
        const id = formInputs['schemeId'];
        if (!id) return;
        try {
            const result = await callTool('get_permission_scheme_by_id', { scheme_id: id });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleResolutionById = async () => {
        const id = formInputs['resId'];
        if (!id) return;
        try {
            const result = await callTool('get_resolution_by_id', { res_id: id });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleSecurityLevelById = async () => {
        const id = formInputs['secId'];
        if (!id) return;
        try {
            const result = await callTool('get_security_level_by_id', { sec_id: id });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleIssueTypeById = async () => {
        const id = formInputs['issueTypeId'];
        if (!id) return;
        try {
            const result = await callTool('get_issue_type_by_id', { type_id: id });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleCreateIssueType = async () => {
        const name = formInputs['newIssueTypeName'];
        if (!name) return;
        try {
            const result = await callTool('create_issue_type', {
                name,
                description: formInputs['newIssueTypeDesc'] || undefined,
                type: formInputs['newIssueTypeType'] || 'standard'
            });
            alert('Issue type created: ' + JSON.stringify(result));
            loadSection('issue-types');
        } catch (e: any) { setError(String(e)); }
    };

    const handleIssueLinkTypeById = async () => {
        const id = formInputs['linkTypeId'];
        if (!id) return;
        try {
            const result = await callTool('get_issue_link_type_by_id', { link_type_id: id });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleProjectCategoryById = async () => {
        const id = formInputs['projCatId'];
        if (!id) return;
        try {
            const result = await callTool('get_project_category_by_id', { cat_id: id });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleValidateLicense = async () => {
        const lic = formInputs['licenseKey'];
        if (!lic) return;
        try {
            const result = await callTool('validate_license', { license: lic });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleStartReindex = async () => {
        try {
            const result = await callTool('start_reindex', {
                reindex_type: formInputs['reindexType'] || 'FOREGROUND',
                index_change_history: formInputs['indexChangeHistory'] === 'true',
                index_worklogs: formInputs['indexWorklogs'] === 'true',
                index_comments: formInputs['indexComments'] === 'true'
            });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleAppRoleByKey = async () => {
        const key = formInputs['appRoleKey'];
        if (!key) return;
        try {
            const result = await callTool('get_application_role_by_key', { key });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleUpdateAppProperty = async () => {
        const id = formInputs['appPropId'];
        const value = formInputs['appPropValue'];
        if (!id || !value) return;
        try {
            const result = await callTool('update_application_property_by_id', { id, value });
            setData(result);
            alert('Property updated');
        } catch (e: any) { setError(String(e)); }
    };

    const handleUpdateUserPreferences = async () => {
        try {
            const prefs: Record<string, string> = {};
            if (formInputs['prefLocale']) prefs.locale = formInputs['prefLocale'];
            if (formInputs['prefTimezone']) prefs.timezone = formInputs['prefTimezone'];
            const result = await callTool('update_current_user_preferences', { value: prefs });
            setData(result);
            alert('Preferences updated');
        } catch (e: any) { setError(String(e)); }
    };

    const handleCreateWebhook = async () => {
        const url = formInputs['webhookUrl'];
        const name = formInputs['webhookName'];
        if (!url || !name) return;
        try {
            const events = (formInputs['webhookEvents'] || '').split(',').map(e => e.trim()).filter(Boolean);
            const result = await callTool('create_webhooks', {
                webhooks: [{ name, url, events }]
            });
            alert('Webhook created: ' + JSON.stringify(result));
            loadSection('webhooks');
        } catch (e: any) { setError(String(e)); }
    };

    const handleDeleteWebhooks = async () => {
        const ids = (formInputs['webhookDeleteIds'] || '').split(',').map(s => s.trim()).filter(Boolean);
        if (ids.length === 0) return;
        try {
            const result = await callTool('delete_webhooks_by_ids', { webhookIds: ids });
            alert('Deleted: ' + JSON.stringify(result));
            loadSection('webhooks');
        } catch (e: any) { setError(String(e)); }
    };

    const handleUploadAvatar = async () => {
        try {
            const result = await callTool('upload_avatar', {
                filetype: formInputs['avatarFiletype'] || 'image/png',
                filename: formInputs['avatarFilename'] || 'avatar.png',
                username: formInputs['avatarUsername'] || undefined,
                project_key: formInputs['avatarProjectKey'] || undefined
            });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleUploadTempAvatar = async () => {
        try {
            const result = await callTool('upload_temporary_avatar', {
                filetype: formInputs['tempAvatarFiletype'] || 'image/png',
                filename: formInputs['tempAvatarFilename'] || 'temp_avatar.png',
                username: formInputs['tempAvatarUsername'] || undefined,
                project_key: formInputs['tempAvatarProjectKey'] || undefined
            });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleCropTempAvatar = async () => {
        try {
            const result = await callTool('crop_temporary_avatar', {
                avatar_id: formInputs['cropAvatarId'] || '',
                cropDimensions: {
                    x: parseInt(formInputs['cropX'] || '0'),
                    y: parseInt(formInputs['cropY'] || '0'),
                    width: parseInt(formInputs['cropWidth'] || '100'),
                    height: parseInt(formInputs['cropHeight'] || '100')
                }
            });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleGetUserAvatars = async () => {
        const username = formInputs['userAvatarUsername'];
        if (!username) return;
        try {
            const result = await callTool('get_user_avatars_by_username', { username });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleGetProjectAvatars = async () => {
        const key = formInputs['projAvatarKey'];
        if (!key) return;
        try {
            const result = await callTool('get_project_avatars_by_key', { project_key: key });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleGetProjectByKey = async () => {
        const key = formInputs['projectDetailKey'];
        if (!key) return;
        try {
            const result = await callTool('get_project_by_key', { project_key: key });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleComponentById = async () => {
        const id = formInputs['componentId'];
        if (!id) return;
        try {
            const result = await callTool('get_component_by_id', { component_id: id });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handleFilterById = async () => {
        const id = formInputs['filterId'];
        if (!id) return;
        try {
            const result = await callTool('get_filter_by_id', { filter_id: id });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const handlePriorityById = async () => {
        const id = formInputs['priorityId'];
        if (!id) return;
        try {
            const result = await callTool('get_priority_by_id', { priority_id: id });
            setData(result);
        } catch (e: any) { setError(String(e)); }
    };

    const inputStyle: React.CSSProperties = { padding: '7px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '13px', backgroundColor: '#fafbfc', outline: 'none' };
    const btnStyle: React.CSSProperties = { padding: '7px 14px', border: 'none', borderRadius: '7px', backgroundColor: '#CA8A04', color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 600, boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)' };
    const secondaryBtnStyle: React.CSSProperties = { padding: '7px 14px', border: '1px solid #e2e8f0', borderRadius: '7px', backgroundColor: 'white', color: '#475569', cursor: 'pointer', fontSize: '13px', fontWeight: 500 };
    const formGroupStyle: React.CSSProperties = { marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' };
    const formLabelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: '#64748b', minWidth: '90px', textTransform: 'uppercase', letterSpacing: '0.02em' };

    const renderActionForms = () => {
        switch (activeSection) {
            case 'statuses':
                return (
                    <div style={formGroupStyle}>
                        <span style={formLabelStyle}>Get by ID:</span>
                        <input style={inputStyle} value={formInputs['statusId'] || ''} onChange={e => setFormInputs(p => ({ ...p, statusId: e.target.value }))} placeholder="Status ID" />
                        <button style={secondaryBtnStyle} onClick={handleStatusById}>Fetch</button>
                    </div>
                );
            case 'status-categories':
                return (
                    <div style={formGroupStyle}>
                        <span style={formLabelStyle}>Get by ID:</span>
                        <input style={inputStyle} value={formInputs['statusCatId'] || ''} onChange={e => setFormInputs(p => ({ ...p, statusCatId: e.target.value }))} placeholder="Category ID" />
                        <button style={secondaryBtnStyle} onClick={handleStatusCategoryById}>Fetch</button>
                    </div>
                );
            case 'roles':
                return (
                    <div style={formGroupStyle}>
                        <span style={formLabelStyle}>Get by ID:</span>
                        <input style={inputStyle} value={formInputs['roleId'] || ''} onChange={e => setFormInputs(p => ({ ...p, roleId: e.target.value }))} placeholder="Role ID" />
                        <button style={secondaryBtnStyle} onClick={handleRoleById}>Fetch</button>
                    </div>
                );
            case 'permission-schemes':
                return (
                    <div style={formGroupStyle}>
                        <span style={formLabelStyle}>Get by ID:</span>
                        <input style={inputStyle} value={formInputs['schemeId'] || ''} onChange={e => setFormInputs(p => ({ ...p, schemeId: e.target.value }))} placeholder="Scheme ID" />
                        <button style={secondaryBtnStyle} onClick={handlePermissionSchemeById}>Fetch</button>
                    </div>
                );
            case 'resolutions':
                return (
                    <div>
                        <div style={formGroupStyle}>
                            <span style={formLabelStyle}>Get by ID:</span>
                            <input style={inputStyle} value={formInputs['resId'] || ''} onChange={e => setFormInputs(p => ({ ...p, resId: e.target.value }))} placeholder="Resolution ID" />
                            <button style={secondaryBtnStyle} onClick={handleResolutionById}>Fetch</button>
                        </div>
                        <div style={formGroupStyle}>
                            <span style={formLabelStyle}>Priority by ID:</span>
                            <input style={inputStyle} value={formInputs['priorityId'] || ''} onChange={e => setFormInputs(p => ({ ...p, priorityId: e.target.value }))} placeholder="Priority ID" />
                            <button style={secondaryBtnStyle} onClick={handlePriorityById}>Fetch</button>
                        </div>
                    </div>
                );
            case 'security-levels':
                return (
                    <div style={formGroupStyle}>
                        <span style={formLabelStyle}>Get by ID:</span>
                        <input style={inputStyle} value={formInputs['secId'] || ''} onChange={e => setFormInputs(p => ({ ...p, secId: e.target.value }))} placeholder="Security Level ID" />
                        <button style={secondaryBtnStyle} onClick={handleSecurityLevelById}>Fetch</button>
                    </div>
                );
            case 'issue-types':
                return (
                    <div>
                        <div style={formGroupStyle}>
                            <span style={formLabelStyle}>Get by ID:</span>
                            <input style={inputStyle} value={formInputs['issueTypeId'] || ''} onChange={e => setFormInputs(p => ({ ...p, issueTypeId: e.target.value }))} placeholder="Issue Type ID" />
                            <button style={secondaryBtnStyle} onClick={handleIssueTypeById}>Fetch</button>
                        </div>
                        <div style={{ padding: '14px', backgroundColor: '#fafbfc', borderRadius: '10px', marginBottom: '12px', boxShadow: '0 0 0 1px #f1f5f9' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Create Issue Type</h4>
                            <div style={formGroupStyle}>
                                <input style={{ ...inputStyle, flex: 1 }} value={formInputs['newIssueTypeName'] || ''} onChange={e => setFormInputs(p => ({ ...p, newIssueTypeName: e.target.value }))} placeholder="Name *" />
                                <input style={{ ...inputStyle, flex: 1 }} value={formInputs['newIssueTypeDesc'] || ''} onChange={e => setFormInputs(p => ({ ...p, newIssueTypeDesc: e.target.value }))} placeholder="Description" />
                                <select style={inputStyle} value={formInputs['newIssueTypeType'] || 'standard'} onChange={e => setFormInputs(p => ({ ...p, newIssueTypeType: e.target.value }))}>
                                    <option value="standard">Standard</option>
                                    <option value="subtask">Subtask</option>
                                </select>
                                <button style={btnStyle} onClick={handleCreateIssueType}>Create</button>
                            </div>
                        </div>
                    </div>
                );
            case 'issue-link-types':
                return (
                    <div style={formGroupStyle}>
                        <span style={formLabelStyle}>Get by ID:</span>
                        <input style={inputStyle} value={formInputs['linkTypeId'] || ''} onChange={e => setFormInputs(p => ({ ...p, linkTypeId: e.target.value }))} placeholder="Link Type ID" />
                        <button style={secondaryBtnStyle} onClick={handleIssueLinkTypeById}>Fetch</button>
                    </div>
                );
            case 'project-categories':
                return (
                    <div>
                        <div style={formGroupStyle}>
                            <span style={formLabelStyle}>Get by ID:</span>
                            <input style={inputStyle} value={formInputs['projCatId'] || ''} onChange={e => setFormInputs(p => ({ ...p, projCatId: e.target.value }))} placeholder="Category ID" />
                            <button style={secondaryBtnStyle} onClick={handleProjectCategoryById}>Fetch</button>
                        </div>
                        <div style={formGroupStyle}>
                            <span style={formLabelStyle}>Component by ID:</span>
                            <input style={inputStyle} value={formInputs['componentId'] || ''} onChange={e => setFormInputs(p => ({ ...p, componentId: e.target.value }))} placeholder="Component ID" />
                            <button style={secondaryBtnStyle} onClick={handleComponentById}>Fetch</button>
                        </div>
                    </div>
                );
            case 'license':
                return (
                    <div style={formGroupStyle}>
                        <span style={formLabelStyle}>License Key:</span>
                        <input style={{ ...inputStyle, flex: 1 }} value={formInputs['licenseKey'] || ''} onChange={e => setFormInputs(p => ({ ...p, licenseKey: e.target.value }))} placeholder="Enter license key..." />
                        <button style={btnStyle} onClick={handleValidateLicense}>Validate</button>
                    </div>
                );
            case 'reindex':
                return (
                    <div>
                        <div style={formGroupStyle}>
                            <span style={formLabelStyle}>Type:</span>
                            <select style={inputStyle} value={formInputs['reindexType'] || 'FOREGROUND'} onChange={e => setFormInputs(p => ({ ...p, reindexType: e.target.value }))}>
                                <option value="FOREGROUND">Foreground</option>
                                <option value="BACKGROUND">Background</option>
                            </select>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                                <input type="checkbox" checked={formInputs['indexComments'] === 'true'} onChange={e => setFormInputs(p => ({ ...p, indexComments: e.target.checked ? 'true' : 'false' }))} /> Comments
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                                <input type="checkbox" checked={formInputs['indexWorklogs'] === 'true'} onChange={e => setFormInputs(p => ({ ...p, indexWorklogs: e.target.checked ? 'true' : 'false' }))} /> Worklogs
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                                <input type="checkbox" checked={formInputs['indexChangeHistory'] === 'true'} onChange={e => setFormInputs(p => ({ ...p, indexChangeHistory: e.target.checked ? 'true' : 'false' }))} /> Change History
                            </label>
                            <button style={btnStyle} onClick={handleStartReindex}>Start Reindex</button>
                        </div>
                    </div>
                );
            case 'app-roles':
                return (
                    <div style={formGroupStyle}>
                        <span style={formLabelStyle}>Get by Key:</span>
                        <input style={inputStyle} value={formInputs['appRoleKey'] || ''} onChange={e => setFormInputs(p => ({ ...p, appRoleKey: e.target.value }))} placeholder="Role key" />
                        <button style={secondaryBtnStyle} onClick={handleAppRoleByKey}>Fetch</button>
                    </div>
                );
            case 'app-properties':
                return (
                    <div style={{ padding: '14px', backgroundColor: '#fafbfc', borderRadius: '10px', marginBottom: '12px', boxShadow: '0 0 0 1px #f1f5f9' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#172B4D' }}>Update Property</h4>
                        <div style={formGroupStyle}>
                            <input style={{ ...inputStyle, flex: 1 }} value={formInputs['appPropId'] || ''} onChange={e => setFormInputs(p => ({ ...p, appPropId: e.target.value }))} placeholder="Property ID" />
                            <input style={{ ...inputStyle, flex: 1 }} value={formInputs['appPropValue'] || ''} onChange={e => setFormInputs(p => ({ ...p, appPropValue: e.target.value }))} placeholder="New value" />
                            <button style={btnStyle} onClick={handleUpdateAppProperty}>Update</button>
                        </div>
                    </div>
                );
            case 'user-preferences':
                return (
                    <div style={{ padding: '14px', backgroundColor: '#fafbfc', borderRadius: '10px', marginBottom: '12px', boxShadow: '0 0 0 1px #f1f5f9' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#172B4D' }}>Update Preferences</h4>
                        <div style={formGroupStyle}>
                            <input style={{ ...inputStyle, flex: 1 }} value={formInputs['prefLocale'] || ''} onChange={e => setFormInputs(p => ({ ...p, prefLocale: e.target.value }))} placeholder="Locale (e.g., en_US)" />
                            <input style={{ ...inputStyle, flex: 1 }} value={formInputs['prefTimezone'] || ''} onChange={e => setFormInputs(p => ({ ...p, prefTimezone: e.target.value }))} placeholder="Timezone (e.g., America/New_York)" />
                            <button style={btnStyle} onClick={handleUpdateUserPreferences}>Update</button>
                        </div>
                    </div>
                );
            case 'webhooks':
                return (
                    <div>
                        <div style={{ padding: '14px', backgroundColor: '#fafbfc', borderRadius: '10px', marginBottom: '12px', boxShadow: '0 0 0 1px #f1f5f9' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Create Webhook</h4>
                            <div style={formGroupStyle}>
                                <input style={{ ...inputStyle, flex: 1 }} value={formInputs['webhookName'] || ''} onChange={e => setFormInputs(p => ({ ...p, webhookName: e.target.value }))} placeholder="Name *" />
                                <input style={{ ...inputStyle, flex: 2 }} value={formInputs['webhookUrl'] || ''} onChange={e => setFormInputs(p => ({ ...p, webhookUrl: e.target.value }))} placeholder="URL *" />
                            </div>
                            <div style={formGroupStyle}>
                                <input style={{ ...inputStyle, flex: 1 }} value={formInputs['webhookEvents'] || ''} onChange={e => setFormInputs(p => ({ ...p, webhookEvents: e.target.value }))} placeholder="Events (comma-separated)" />
                                <button style={btnStyle} onClick={handleCreateWebhook}>Create</button>
                            </div>
                        </div>
                        <div style={{ padding: '14px', backgroundColor: '#fef2f2', borderRadius: '10px', marginBottom: '12px', boxShadow: '0 0 0 1px #fecaca' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#991b1b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Delete Webhooks</h4>
                            <div style={formGroupStyle}>
                                <input style={{ ...inputStyle, flex: 1 }} value={formInputs['webhookDeleteIds'] || ''} onChange={e => setFormInputs(p => ({ ...p, webhookDeleteIds: e.target.value }))} placeholder="Webhook IDs (comma-separated)" />
                                <button style={{ ...btnStyle, backgroundColor: '#dc2626' }} onClick={handleDeleteWebhooks}>Delete</button>
                            </div>
                        </div>
                    </div>
                );
            case 'jql':
                return (
                    <div style={formGroupStyle}>
                        <span style={formLabelStyle}>Filter by ID:</span>
                        <input style={inputStyle} value={formInputs['filterId'] || ''} onChange={e => setFormInputs(p => ({ ...p, filterId: e.target.value }))} placeholder="Filter ID" />
                        <button style={secondaryBtnStyle} onClick={handleFilterById}>Fetch</button>
                    </div>
                );
            case 'avatars':
                return (
                    <div>
                        <div style={{ padding: '14px', backgroundColor: '#fafbfc', borderRadius: '10px', marginBottom: '12px', boxShadow: '0 0 0 1px #f1f5f9' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Upload Avatar</h4>
                            <div style={formGroupStyle}>
                                <input style={inputStyle} value={formInputs['avatarFilename'] || ''} onChange={e => setFormInputs(p => ({ ...p, avatarFilename: e.target.value }))} placeholder="Filename" />
                                <input style={inputStyle} value={formInputs['avatarFiletype'] || ''} onChange={e => setFormInputs(p => ({ ...p, avatarFiletype: e.target.value }))} placeholder="MIME type (image/png)" />
                                <input style={inputStyle} value={formInputs['avatarUsername'] || ''} onChange={e => setFormInputs(p => ({ ...p, avatarUsername: e.target.value }))} placeholder="Username (optional)" />
                                <input style={inputStyle} value={formInputs['avatarProjectKey'] || ''} onChange={e => setFormInputs(p => ({ ...p, avatarProjectKey: e.target.value }))} placeholder="Project Key (optional)" />
                                <button style={btnStyle} onClick={handleUploadAvatar}>Upload</button>
                            </div>
                        </div>
                        <div style={{ padding: '14px', backgroundColor: '#fafbfc', borderRadius: '10px', marginBottom: '12px', boxShadow: '0 0 0 1px #f1f5f9' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Upload Temporary Avatar</h4>
                            <div style={formGroupStyle}>
                                <input style={inputStyle} value={formInputs['tempAvatarFilename'] || ''} onChange={e => setFormInputs(p => ({ ...p, tempAvatarFilename: e.target.value }))} placeholder="Filename" />
                                <input style={inputStyle} value={formInputs['tempAvatarFiletype'] || ''} onChange={e => setFormInputs(p => ({ ...p, tempAvatarFiletype: e.target.value }))} placeholder="MIME type" />
                                <input style={inputStyle} value={formInputs['tempAvatarUsername'] || ''} onChange={e => setFormInputs(p => ({ ...p, tempAvatarUsername: e.target.value }))} placeholder="Username (optional)" />
                                <input style={inputStyle} value={formInputs['tempAvatarProjectKey'] || ''} onChange={e => setFormInputs(p => ({ ...p, tempAvatarProjectKey: e.target.value }))} placeholder="Project Key (optional)" />
                                <button style={btnStyle} onClick={handleUploadTempAvatar}>Upload Temp</button>
                            </div>
                        </div>
                        <div style={{ padding: '14px', backgroundColor: '#fafbfc', borderRadius: '10px', marginBottom: '12px', boxShadow: '0 0 0 1px #f1f5f9' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Crop Temporary Avatar</h4>
                            <div style={formGroupStyle}>
                                <input style={inputStyle} value={formInputs['cropAvatarId'] || ''} onChange={e => setFormInputs(p => ({ ...p, cropAvatarId: e.target.value }))} placeholder="Avatar ID" />
                                <input style={{ ...inputStyle, width: '60px' }} value={formInputs['cropX'] || ''} onChange={e => setFormInputs(p => ({ ...p, cropX: e.target.value }))} placeholder="X" />
                                <input style={{ ...inputStyle, width: '60px' }} value={formInputs['cropY'] || ''} onChange={e => setFormInputs(p => ({ ...p, cropY: e.target.value }))} placeholder="Y" />
                                <input style={{ ...inputStyle, width: '60px' }} value={formInputs['cropWidth'] || ''} onChange={e => setFormInputs(p => ({ ...p, cropWidth: e.target.value }))} placeholder="Width" />
                                <input style={{ ...inputStyle, width: '60px' }} value={formInputs['cropHeight'] || ''} onChange={e => setFormInputs(p => ({ ...p, cropHeight: e.target.value }))} placeholder="Height" />
                                <button style={btnStyle} onClick={handleCropTempAvatar}>Crop</button>
                            </div>
                        </div>
                        <div style={{ padding: '14px', backgroundColor: '#fafbfc', borderRadius: '10px', marginBottom: '12px', boxShadow: '0 0 0 1px #f1f5f9' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Get User Avatars</h4>
                            <div style={formGroupStyle}>
                                <input style={inputStyle} value={formInputs['userAvatarUsername'] || ''} onChange={e => setFormInputs(p => ({ ...p, userAvatarUsername: e.target.value }))} placeholder="Username" />
                                <button style={secondaryBtnStyle} onClick={handleGetUserAvatars}>Fetch</button>
                            </div>
                        </div>
                        <div style={{ padding: '14px', backgroundColor: '#fafbfc', borderRadius: '10px', marginBottom: '12px', boxShadow: '0 0 0 1px #f1f5f9' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Get Project Avatars</h4>
                            <div style={formGroupStyle}>
                                <input style={inputStyle} value={formInputs['projAvatarKey'] || ''} onChange={e => setFormInputs(p => ({ ...p, projAvatarKey: e.target.value }))} placeholder="Project Key" />
                                <button style={secondaryBtnStyle} onClick={handleGetProjectAvatars}>Fetch</button>
                            </div>
                        </div>
                        <div style={{ padding: '14px', backgroundColor: '#fafbfc', borderRadius: '10px', marginBottom: '12px', boxShadow: '0 0 0 1px #f1f5f9' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Get Project Details</h4>
                            <div style={formGroupStyle}>
                                <input style={inputStyle} value={formInputs['projectDetailKey'] || ''} onChange={e => setFormInputs(p => ({ ...p, projectDetailKey: e.target.value }))} placeholder="Project Key" />
                                <button style={secondaryBtnStyle} onClick={handleGetProjectByKey}>Fetch</button>
                            </div>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div style={{ height: '100%', display: 'flex', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
            {/* Sidebar */}
            <div style={{ width: '232px', flexShrink: 0, borderRight: '1px solid #e2e8f0', overflowY: 'auto', backgroundColor: 'white' }}>
                <div style={{ padding: '20px 12px' }}>
                    <h3 style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.06em', padding: '0 10px' }}>Administration</h3>
                    {SECTIONS.map(section => {
                        const active = activeSection === section.id;
                        return (
                        <div
                            key={section.id}
                            onClick={() => handleSectionClick(section.id)}
                            style={{
                                padding: '7px 12px',
                                cursor: 'pointer',
                                borderRadius: '8px',
                                backgroundColor: active ? '#fef3c7' : 'transparent',
                                color: active ? '#854d0e' : '#475569',
                                fontSize: '13px',
                                marginBottom: '2px',
                                fontWeight: active ? 600 : 500,
                                transition: 'background-color 0.12s, color 0.12s'
                            }}
                            onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                            onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                            {section.label}
                        </div>
                        );
                    })}
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, fontSize: '22px', color: '#0f172a', fontWeight: 600, letterSpacing: '-0.015em' }}>
                        {SECTIONS.find(s => s.id === activeSection)?.label}
                    </h2>
                    <button onClick={() => loadSection(activeSection)} style={{ padding: '7px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: 'white', color: '#475569', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                        Refresh
                    </button>
                </div>

                {/* Action forms */}
                {renderActionForms()}

                {/* Data display */}
                {loading && <div style={{ color: '#94a3b8', padding: '24px', fontSize: '14px' }}>Loading...</div>}
                {error && <div style={{ color: '#991b1b', padding: '12px 14px', backgroundColor: '#fef2f2', borderRadius: '10px', marginBottom: '12px', boxShadow: '0 0 0 1px #fecaca', fontSize: '13.5px', fontWeight: 500 }}>Error: {error}</div>}
                {data && !loading && (
                    <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '18px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(15, 23, 42, 0.04)' }}>
                        <pre style={{ margin: 0, fontSize: '12.5px', color: '#1e293b', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '520px', overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: 1.55 }}>
                            {JSON.stringify(data, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminPanel;
