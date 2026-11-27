import React, { useMemo } from 'react';

interface User {
    name?: string;
    accountId?: string;
    emailAddress?: string;
    displayName: string;
}

interface UserSelectProps {
    users: User[];
    value: string | undefined;
    onChange: (value: string) => void;
    placeholder?: string;
    id?: string;
}

export const UserSelect: React.FC<UserSelectProps> = ({ users, value, onChange, placeholder = 'Unassigned', id }) => {
    // Generate unique id to avoid conflicts with multiple datalists
    const datalistId = useMemo(() => id || `user-list-${Math.random().toString(36).substr(2, 9)}`, [id]);

    return (
        <div>
            <select
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    backgroundColor: '#fafbfc',
                    fontSize: '13.5px',
                    color: '#1e293b',
                    outline: 'none',
                    boxSizing: 'border-box'
                }}
            >
                <option value="">{placeholder}</option>
                {users.map((user) => {
                    const userKey = user.name || user.accountId || user.displayName;
                    return (
                        <option key={userKey} value={userKey}>
                            {user.displayName} {user.emailAddress ? `(${user.emailAddress})` : ''}
                        </option>
                    );
                })}
            </select>
        </div>
    );
};
