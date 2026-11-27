import React, { useState } from 'react';

interface CreateUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (userData: any) => Promise<void>;
}

const CreateUserModal: React.FC<CreateUserModalProps> = ({ isOpen, onClose, onCreate }) => {
    const [name, setName] = useState('');
    const [emailAddress, setEmailAddress] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!name || !emailAddress) {
            setError('Name and Email are required');
            return;
        }

        setLoading(true);
        try {
            await onCreate({
                name,
                emailAddress,
                displayName: displayName || name
            });
            // Reset form
            setName('');
            setEmailAddress('');
            setDisplayName('');
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to create user');
        } finally {
            setLoading(false);
        }
    };

    const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '6px', fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.02em', textTransform: 'uppercase' };
    const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', color: '#1e293b', backgroundColor: '#fafbfc', outline: 'none', boxSizing: 'border-box' };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: 'white',
                width: '500px',
                maxWidth: '90%',
                borderRadius: '14px',
                boxShadow: '0 20px 50px -12px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.05)',
                overflow: 'hidden'
            }}>
                <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: 600, letterSpacing: '-0.01em' }}>Create User</h2>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        {error && (
                            <div style={{
                                padding: '12px 14px',
                                backgroundColor: '#fef2f2',
                                color: '#991b1b',
                                borderRadius: '8px',
                                fontSize: '13.5px',
                                border: '1px solid #fecaca',
                                fontWeight: 500
                            }}>
                                {error}
                            </div>
                        )}

                        <div>
                            <label style={labelStyle}>
                                Username <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Enter username"
                                style={inputStyle}
                                required
                            />
                        </div>

                        <div>
                            <label style={labelStyle}>
                                Email Address <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <input
                                type="email"
                                value={emailAddress}
                                onChange={e => setEmailAddress(e.target.value)}
                                placeholder="user@example.com"
                                style={inputStyle}
                                required
                            />
                        </div>

                        <div>
                            <label style={labelStyle}>
                                Display Name
                            </label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
                                placeholder="Leave empty to use username"
                                style={inputStyle}
                            />
                        </div>
                    </div>

                    <div style={{
                        padding: '16px 28px',
                        borderTop: '1px solid #f1f5f9',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '8px',
                        backgroundColor: '#fafbfc'
                    }}>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            style={{
                                padding: '9px 16px',
                                border: 'none',
                                background: 'transparent',
                                color: '#475569',
                                cursor: 'pointer',
                                fontWeight: 500,
                                fontSize: '14px',
                                borderRadius: '8px'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                padding: '9px 18px',
                                border: 'none',
                                borderRadius: '8px',
                                backgroundColor: '#CA8A04',
                                color: 'white',
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontSize: '14px',
                                opacity: loading ? 0.6 : 1,
                                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
                            }}
                        >
                            {loading ? 'Creating...' : 'Create User'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateUserModal;
