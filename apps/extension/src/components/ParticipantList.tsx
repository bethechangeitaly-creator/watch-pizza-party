import React from 'react';
import { User } from '@watch-party/shared';
import { Crown, User as UserIcon } from 'lucide-react';

interface ParticipantListProps {
    participants: User[];
}

export function ParticipantList({ participants }: ParticipantListProps) {
    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-950/20">
            <h3 className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-4">Participants</h3>
            {participants.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-gray-800/40 rounded-lg border border-gray-700/50">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${p.role === 'host' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-gray-700/50 text-gray-400'}`}>
                            <UserIcon size={16} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-200">{p.username}</span>
                            <span className="text-[10px] text-gray-500">Joined {new Date(p.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                    </div>
                    {p.role === 'host' && (
                        <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded">
                            <Crown size={12} />
                            HOST
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
