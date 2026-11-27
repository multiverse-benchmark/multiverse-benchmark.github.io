import React, { useState, useEffect } from 'react';
import type { User, Group } from '../App';
import CreateUserModal from './CreateUserModal';

// Toast notification types
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
    title?: string;
}

// Toast Component
const ToastNotification = ({ toast, onClose }: { toast: Toast; onClose: () => void }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 5000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const bgColor = {
        success: '#dcfce7',
        error: '#fef2f2',
        warning: '#fef3c7',
        info: '#dbeafe'
    }[toast.type];

    const accentColor = {
        success: '#16a34a',
        error: '#dc2626',
        warning: '#CA8A04',
        info: '#2563eb'
    }[toast.type];

    const fgColor = {
        success: '#166534',
        error: '#991b1b',
        warning: '#854d0e',
        info: '#1e40af'
    }[toast.type];

    const icon = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    }[toast.type];

    return (
        <div style={{
            backgroundColor: 'white',
            borderRadius: '10px',
            padding: '14px 16px',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            boxShadow: '0 8px 24px -8px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.06)',
            maxWidth: '420px'
        }}>
            <span style={{
                color: accentColor,
                backgroundColor: bgColor,
                width: '24px',
                height: '24px',
                borderRadius: '999px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 600,
                flexShrink: 0
            }}>{icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                {toast.title && (
                    <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '3px', fontSize: '13.5px', letterSpacing: '-0.005em' }}>
                        {toast.title}
                    </div>
                )}
                <div style={{ color: fgColor, fontSize: '12.5px', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                    {toast.message}
                </div>
            </div>
            <button
                onClick={onClose}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '0',
                    fontSize: '16px',
                    lineHeight: 1,
                    flexShrink: 0
                }}
            >
                ×
            </button>
        </div>
    );
};

// Toast Container
const ToastContainer = ({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: number) => void }) => {
    if (toasts.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999
        }}>
            {toasts.map(toast => (
                <ToastNotification
                    key={toast.id}
                    toast={toast}
                    onClose={() => removeToast(toast.id)}
                />
            ))}
        </div>
    );
};

interface UsersGroupsManagementProps {
    getUsers: (searchString: string) => Promise<any[]>;
    getUser: (username?: string, accountId?: string) => Promise<any>;
    createUser: (payload: any) => Promise<any>;
    deleteUser: (username?: string, key?: string) => Promise<any>;
    getGroup: (groupname?: string, groupId?: string) => Promise<any>;
    createGroup: (name: string) => Promise<any>;
    updateGroup: (groupname: string, users: string[]) => Promise<any>;
    deleteGroup: (groupname?: string, groupId?: string) => Promise<any>;
    findGroups: (query?: string, maxResults?: number, accountId?: string) => Promise<any>;
}

type TabType = 'users' | 'groups';

const UsersGroupsManagement = ({
    getUsers,
    createUser,
    deleteUser,
    getGroup,
    createGroup,
    updateGroup,
    deleteGroup,
    findGroups
}: UsersGroupsManagementProps) => {
    const [activeTab, setActiveTab] = useState<TabType>('users');
    const [users, setUsers] = useState<User[]>([]);
    const [groups, setGroups] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateUserModal, setShowCreateUserModal] = useState(false);
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
    const [editingGroup, setEditingGroup] = useState<Group | null>(null);
    const [newGroupName, setNewGroupName] = useState('');
    const [groupMembers, setGroupMembers] = useState<string[]>([]);
    const [newMember, setNewMember] = useState('');
    const [availableUsers, setAvailableUsers] = useState<User[]>([]);
    const [toasts, setToasts] = useState<Toast[]>([]);

    // Toast helpers
    const addToast = (message: string, type: ToastType, title?: string) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type, title }]);
    };

    const removeToast = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    // Parse error message to make it user-friendly
    const parseErrorMessage = (error: any): { title: string; message: string } => {
        const errorStr = String(error);

        // Check for UserHasReferencesError
        if (errorStr.includes('UserHasReferencesError')) {
            const match = errorStr.match(/Cannot delete user '([^']+)': user owns or is referenced by (\d+) record\(s\): (.+)/);
            if (match) {
                const [, username, count, references] = match;
                // Parse the references to make them more readable
                const refList = references.split(', ').map((ref: string) => {
                    const refMatch = ref.match(/issue '([^']+)' \(as ([^)]+)\)/);
                    if (refMatch) {
                        return `• Issue ${refMatch[1]} (${refMatch[2]})`;
                    }
                    return `• ${ref}`;
                }).join('\n');

                return {
                    title: `Cannot Delete User "${username}"`,
                    message: `This user is referenced by ${count} record(s):\n${refList}\n\nPlease reassign these items before deleting.`
                };
            }
        }

        // Check for other common errors
        if (errorStr.includes('not found')) {
            return {
                title: 'Not Found',
                message: 'The requested resource could not be found.'
            };
        }

        // Default error
        return {
            title: 'Error',
            message: errorStr.replace(/^Error:\s*/i, '').replace(/^Tool execution failed:\s*/i, '')
        };
    };

    // Fetch users
    const fetchUsers = async (query: string = '@') => {
        try {
            setLoading(true);
            const result = await getUsers(query);
            setUsers(result || []);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    };

    // Fetch groups
    const fetchGroups = async () => {
        try {
            setLoading(true);
            const result = await findGroups('', 100);
            if (result && result.groups) {
                setGroups(result.groups);
            }
        } catch (error) {
            console.error('Failed to fetch groups:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'users') {
            fetchUsers(searchQuery || '@');
        } else {
            fetchGroups();
        }
    }, [activeTab]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (activeTab === 'users') {
            fetchUsers(searchQuery || '@');
        }
    };

    const handleCreateUser = async (userData: any) => {
        await createUser(userData);
        fetchUsers(searchQuery || '@');
    };

    const handleDeleteUser = async (username: string, displayName: string) => {
        if (!confirm(`Are you sure you want to delete user "${displayName}"?`)) return;
        try {
            await deleteUser(username);
            addToast(`User "${displayName}" has been deleted successfully.`, 'success', 'User Deleted');
            fetchUsers(searchQuery || '@');
        } catch (error) {
            console.error('Failed to delete user:', error);
            const { title, message } = parseErrorMessage(error);
            addToast(message, 'error', title);
        }
    };

    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) {
            addToast('Group name is required', 'warning', 'Validation Error');
            return;
        }
        try {
            await createGroup(newGroupName.trim());
            addToast(`Group "${newGroupName.trim()}" has been created successfully.`, 'success', 'Group Created');
            setShowCreateGroupModal(false);
            setNewGroupName('');
            fetchGroups();
        } catch (error) {
            console.error('Failed to create group:', error);
            const { title, message } = parseErrorMessage(error);
            addToast(message, 'error', title);
        }
    };

    const handleEditGroup = async (groupName: string) => {
        if (!groupName || groupName.trim() === '') {
            addToast('Invalid group name', 'warning', 'Validation Error');
            return;
        }
        try {
            // Fetch available users first
            const usersResult = await getUsers('@');
            setAvailableUsers(usersResult || []);

            const result = await getGroup(groupName.trim(), undefined);
            if (result && result.group) {
                setEditingGroup(result.group);
                setGroupMembers(result.group.users || []);
            } else {
                // If no group details, just set the name for editing
                setEditingGroup({ groupId: groupName, name: groupName, users: [] });
                setGroupMembers([]);
            }
        } catch (error) {
            console.error('Failed to fetch group details:', error);
            const { title, message } = parseErrorMessage(error);
            addToast(message, 'error', title);
        }
    };

    const handleUpdateGroupMembers = async () => {
        if (!editingGroup) return;
        try {
            await updateGroup(editingGroup.name, groupMembers);
            addToast(`Group "${editingGroup.name}" has been updated successfully.`, 'success', 'Group Updated');
            setEditingGroup(null);
            setGroupMembers([]);
            fetchGroups();
        } catch (error) {
            console.error('Failed to update group:', error);
            const { title, message } = parseErrorMessage(error);
            addToast(message, 'error', title);
        }
    };

    const handleAddMember = () => {
        if (newMember.trim() && !groupMembers.includes(newMember.trim())) {
            setGroupMembers([...groupMembers, newMember.trim()]);
            setNewMember('');
        }
    };

    const handleRemoveMember = (member: string) => {
        setGroupMembers(groupMembers.filter(m => m !== member));
    };

    const handleDeleteGroup = async (groupName: string) => {
        if (!groupName || groupName.trim() === '') {
            addToast('Invalid group name', 'warning', 'Validation Error');
            return;
        }
        if (!confirm(`Are you sure you want to delete group "${groupName}"?`)) return;
        try {
            await deleteGroup(groupName.trim(), undefined);
            addToast(`Group "${groupName}" has been deleted successfully.`, 'success', 'Group Deleted');
            fetchGroups();
        } catch (error) {
            console.error('Failed to delete group:', error);
            const { title, message } = parseErrorMessage(error);
            addToast(message, 'error', title);
        }
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Toast Notifications */}
            <ToastContainer toasts={toasts} removeToast={removeToast} />

            {/* Header */}
            <div style={{ padding: '32px 32px 16px' }}>
                <h1 style={{ fontSize: '26px', fontWeight: 600, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                    Users & Groups
                </h1>
            </div>

            {/* Tabs */}
            <div style={{ padding: '0 32px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '24px' }}>
                <button
                    onClick={() => setActiveTab('users')}
                    style={{
                        padding: '12px 4px',
                        border: 'none',
                        background: 'transparent',
                        fontSize: '13.5px',
                        fontWeight: activeTab === 'users' ? 600 : 500,
                        color: activeTab === 'users' ? '#0f172a' : '#64748b',
                        borderBottom: activeTab === 'users' ? '2px solid #CA8A04' : '2px solid transparent',
                        cursor: 'pointer',
                        marginBottom: '-1px',
                        transition: 'color 0.15s, border-color 0.15s'
                    }}
                >
                    Users
                </button>
                <button
                    onClick={() => setActiveTab('groups')}
                    style={{
                        padding: '12px 4px',
                        border: 'none',
                        background: 'transparent',
                        fontSize: '13.5px',
                        fontWeight: activeTab === 'groups' ? 600 : 500,
                        color: activeTab === 'groups' ? '#0f172a' : '#64748b',
                        borderBottom: activeTab === 'groups' ? '2px solid #CA8A04' : '2px solid transparent',
                        cursor: 'pointer',
                        marginBottom: '-1px',
                        transition: 'color 0.15s, border-color 0.15s'
                    }}
                >
                    Groups
                </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
                {activeTab === 'users' ? (
                    <>
                        {/* Search Bar */}
                        <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <form onSubmit={handleSearch} style={{ flex: 1, display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search users..."
                                    style={{
                                        flex: 1,
                                        padding: '10px 14px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '10px',
                                        fontSize: '13.5px',
                                        color: '#1e293b',
                                        backgroundColor: 'white',
                                        outline: 'none',
                                        maxWidth: '480px'
                                    }}
                                />
                                <button
                                    type="submit"
                                    style={{
                                        padding: '10px 18px',
                                        backgroundColor: 'white',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '10px',
                                        color: '#475569',
                                        cursor: 'pointer',
                                        fontWeight: 500,
                                        fontSize: '13.5px'
                                    }}
                                >
                                    Search
                                </button>
                            </form>
                            <button
                                onClick={() => setShowCreateUserModal(true)}
                                style={{
                                    padding: '9px 16px',
                                    backgroundColor: '#CA8A04',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: '14px',
                                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
                                }}
                            >
                                Create User
                            </button>
                        </div>

                        {/* Users Table */}
                        {loading ? (
                            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>Loading...</div>
                        ) : (
                            <UsersTable users={users} onDeleteUser={handleDeleteUser} />
                        )}
                    </>
                ) : (
                    <>
                        {/* Groups Header */}
                        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setShowCreateGroupModal(true)}
                                style={{
                                    padding: '9px 16px',
                                    backgroundColor: '#CA8A04',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: '14px',
                                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
                                }}
                            >
                                Create Group
                            </button>
                        </div>

                        {/* Groups Table */}
                        {loading ? (
                            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>Loading...</div>
                        ) : (
                            <GroupsTable
                                groups={groups}
                                onEditGroup={handleEditGroup}
                                onDeleteGroup={handleDeleteGroup}
                            />
                        )}
                    </>
                )}
            </div>

            {/* Create User Modal */}
            <CreateUserModal
                isOpen={showCreateUserModal}
                onClose={() => setShowCreateUserModal(false)}
                onCreate={handleCreateUser}
            />

            {/* Create Group Modal */}
            {showCreateGroupModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.45)',
                    backdropFilter: 'blur(2px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: 'white', width: '440px', maxWidth: '90%',
                        borderRadius: '14px', boxShadow: '0 20px 50px -12px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.05)',
                        overflow: 'hidden'
                    }}>
                        <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #f1f5f9' }}>
                            <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: 600, letterSpacing: '-0.01em' }}>Create Group</h2>
                        </div>

                        <div style={{ padding: '24px 28px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                                    Group Name <span style={{ color: '#dc2626' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                    placeholder="e.g., developers, designers"
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', backgroundColor: '#fafbfc', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>

                        <div style={{ padding: '16px 28px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: '#fafbfc' }}>
                            <button
                                onClick={() => { setShowCreateGroupModal(false); setNewGroupName(''); }}
                                style={{ padding: '9px 16px', border: 'none', background: 'transparent', color: '#475569', fontWeight: 500, fontSize: '14px', cursor: 'pointer', borderRadius: '8px' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateGroup}
                                style={{
                                    padding: '9px 18px', border: 'none', borderRadius: '8px',
                                    backgroundColor: '#CA8A04', color: 'white', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
                                }}
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Group Members Modal */}
            {editingGroup && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.45)',
                    backdropFilter: 'blur(2px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: 'white', width: '540px', maxWidth: '90%',
                        borderRadius: '14px', boxShadow: '0 20px 50px -12px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.05)',
                        overflow: 'hidden'
                    }}>
                        <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #f1f5f9' }}>
                            <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: 600, letterSpacing: '-0.01em' }}>Edit Group <span style={{ color: '#CA8A04' }}>{editingGroup.name}</span><span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#94a3b8', fontWeight: 400 }}>[{editingGroup.groupId}]</span></h2>
                        </div>

                        <div style={{ padding: '24px 28px' }}>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                                    Add Member
                                </label>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <select
                                        value={newMember}
                                        onChange={(e) => setNewMember(e.target.value)}
                                        style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', backgroundColor: '#fafbfc', fontSize: '13.5px', outline: 'none' }}
                                    >
                                        <option value="">— Select a user —</option>
                                        {availableUsers
                                            .filter(user => !groupMembers.includes(user.name || user.accountId))
                                            .map(user => (
                                                <option key={user.accountId} value={user.name || user.accountId}>
                                                    {user.displayName} {user.emailAddress ? `(${user.emailAddress})` : `(@${user.name || user.accountId})`}
                                                </option>
                                            ))
                                        }
                                    </select>
                                    <button
                                        onClick={handleAddMember}
                                        disabled={!newMember}
                                        style={{
                                            padding: '9px 16px', border: 'none', borderRadius: '8px',
                                            backgroundColor: newMember ? '#CA8A04' : '#f1f5f9',
                                            color: newMember ? 'white' : '#94a3b8',
                                            cursor: newMember ? 'pointer' : 'not-allowed',
                                            fontWeight: 600,
                                            fontSize: '13.5px',
                                            boxShadow: newMember ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none'
                                        }}
                                    >
                                        Add
                                    </button>
                                </div>
                                {availableUsers.filter(user => !groupMembers.includes(user.name || user.accountId)).length === 0 && (
                                    <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                                        All users are already members of this group
                                    </p>
                                )}
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                                    Members ({groupMembers.length})
                                </label>
                                <div style={{ maxHeight: '240px', overflowY: 'auto', borderRadius: '10px', backgroundColor: '#fafbfc', boxShadow: '0 0 0 1px #e2e8f0' }}>
                                    {groupMembers.length === 0 ? (
                                        <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                            No members in this group
                                        </div>
                                    ) : (
                                        groupMembers.map((member, idx) => {
                                            const userInfo = availableUsers.find(u => (u.name || u.accountId) === member);
                                            return (
                                                <div
                                                    key={member}
                                                    style={{
                                                        padding: '10px 14px',
                                                        borderTop: idx === 0 ? 'none' : '1px solid #f1f5f9',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#e2e8f0', overflow: 'hidden', flexShrink: 0 }}>
                                                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userInfo?.displayName || member}`} alt="" width="28" height="28" />
                                                        </div>
                                                        <div>
                                                            <div style={{ color: '#0f172a', fontWeight: 500, fontSize: '13.5px' }}>{userInfo?.displayName || member}</div>
                                                            <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>@{member}</div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveMember(member)}
                                                        style={{
                                                            padding: '4px 10px',
                                                            backgroundColor: 'transparent',
                                                            color: '#dc2626',
                                                            border: '1px solid #fecaca',
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            fontSize: '11.5px',
                                                            fontWeight: 500
                                                        }}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '16px 28px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: '#fafbfc' }}>
                            <button
                                onClick={() => { setEditingGroup(null); setGroupMembers([]); setNewMember(''); setAvailableUsers([]); }}
                                style={{ padding: '9px 16px', border: 'none', background: 'transparent', color: '#475569', fontWeight: 500, fontSize: '14px', cursor: 'pointer', borderRadius: '8px' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdateGroupMembers}
                                style={{
                                    padding: '9px 18px', border: 'none', borderRadius: '8px',
                                    backgroundColor: '#CA8A04', color: 'white', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
                                }}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Users Table Component
interface UsersTableProps {
    users: User[];
    onDeleteUser: (username: string, displayName: string) => void;
}

const UsersTable = ({ users, onDeleteUser }: UsersTableProps) => {
    const thStyle: React.CSSProperties = { padding: '12px 20px', color: '#64748b', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' };
    return (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(15, 23, 42, 0.04)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                    <tr style={{ backgroundColor: '#fafbfc', borderBottom: '1px solid #f1f5f9' }}>
                        <th style={thStyle}>User</th>
                        <th style={thStyle}>Email</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Groups</th>
                        <th style={{ ...thStyle, width: '90px' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {users.length === 0 ? (
                        <tr>
                            <td colSpan={5} style={{ padding: '48px 24px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                                <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.4 }}>👥</div>
                                <div style={{ fontWeight: 500, color: '#475569' }}>No users found</div>
                            </td>
                        </tr>
                    ) : (
                        users.map(user => (
                            <tr key={user.accountId} style={{ borderTop: '1px solid #f1f5f9', transition: 'background-color 0.12s' }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fafbfc'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                <td style={{ padding: '14px 20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#f1f5f9', overflow: 'hidden', flexShrink: 0 }}>
                                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.displayName}`} alt="" width="36" height="36" />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 500, color: '#0f172a' }}>{user.displayName}<span style={{ marginLeft: '6px', fontSize: '10.5px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#cbd5e1', fontWeight: 400 }}>[{user.accountId}]</span></div>
                                            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>@{user.name || user.accountId}</div>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ padding: '14px 20px', color: '#475569', fontSize: '13.5px' }}>{user.emailAddress}</td>
                                <td style={{ padding: '14px 20px' }}>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '3px 10px',
                                        borderRadius: '999px',
                                        fontSize: '11.5px',
                                        fontWeight: 600,
                                        color: user.active ? '#166534' : '#475569',
                                        backgroundColor: user.active ? '#dcfce7' : '#f1f5f9'
                                    }}>
                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: user.active ? '#16a34a' : '#94a3b8' }} />
                                        {user.active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td style={{ padding: '14px 20px', color: '#475569', fontSize: '13.5px' }}>
                                    {user.groups?.join(', ') || <span style={{ color: '#cbd5e1' }}>—</span>}
                                </td>
                                <td style={{ padding: '14px 20px' }}>
                                    <button
                                        onClick={() => onDeleteUser(user.name || user.accountId, user.displayName)}
                                        style={{
                                            padding: '5px 10px',
                                            backgroundColor: 'transparent',
                                            color: '#dc2626',
                                            border: '1px solid #fecaca',
                                            borderRadius: '7px',
                                            cursor: 'pointer',
                                            fontSize: '12.5px',
                                            fontWeight: 500
                                        }}
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};

// Groups Table Component
interface GroupsTableProps {
    groups: string[];
    onEditGroup: (groupName: string) => void;
    onDeleteGroup: (groupName: string) => void;
}

const GroupsTable = ({ groups, onEditGroup, onDeleteGroup }: GroupsTableProps) => {
    const thStyle: React.CSSProperties = { padding: '12px 20px', color: '#64748b', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' };
    return (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(15, 23, 42, 0.04)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                    <tr style={{ backgroundColor: '#fafbfc', borderBottom: '1px solid #f1f5f9' }}>
                        <th style={thStyle}>Name</th>
                        <th style={{ ...thStyle, width: '180px' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {groups.length === 0 ? (
                        <tr>
                            <td colSpan={2} style={{ padding: '48px 24px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                                <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.4 }}>👥</div>
                                <div style={{ fontWeight: 500, color: '#475569' }}>No groups found</div>
                            </td>
                        </tr>
                    ) : (
                        groups.map(groupName => (
                            <tr key={groupName} style={{ borderTop: '1px solid #f1f5f9', transition: 'background-color 0.12s' }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fafbfc'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                <td style={{ padding: '14px 20px', color: '#0f172a', fontWeight: 500, fontSize: '13.5px' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ width: '24px', height: '24px', borderRadius: '7px', backgroundColor: '#fef3c7', color: '#854d0e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>{groupName.charAt(0).toUpperCase()}</span>
                                        {groupName}
                                    </span>
                                </td>
                                <td style={{ padding: '14px 20px' }}>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            onClick={() => onEditGroup(groupName)}
                                            style={{
                                                padding: '5px 12px',
                                                backgroundColor: 'white',
                                                color: '#475569',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '7px',
                                                cursor: 'pointer',
                                                fontSize: '12.5px',
                                                fontWeight: 500
                                            }}
                                        >
                                            Edit Members
                                        </button>
                                        <button
                                            onClick={() => onDeleteGroup(groupName)}
                                            style={{
                                                padding: '5px 10px',
                                                backgroundColor: 'transparent',
                                                color: '#dc2626',
                                                border: '1px solid #fecaca',
                                                borderRadius: '7px',
                                                cursor: 'pointer',
                                                fontSize: '12.5px',
                                                fontWeight: 500
                                            }}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default UsersGroupsManagement;
