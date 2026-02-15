import React, { useState, useEffect } from 'react';
import { Room } from '@watch-party/shared';
import { Socket } from 'socket.io-client';
import { Play, Pause, ShieldCheck, Activity } from 'lucide-react';

interface SyncControlsProps {
    room: Room;
    username: string;
    socket: Socket | null;
}

export function SyncControls({ room, username, socket }: SyncControlsProps) {
    const isHost = room.hostId === room.participants.find(p => p.username === username)?.id;

    return (
        <div className="bg-white dark:bg-gray-900 rounded-[28px] p-6 shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="flex flex-col items-center">
                {/* Status Ring */}
                <div className="relative w-32 h-32 flex items-center justify-center mb-6">
                    <div className="absolute inset-0 rounded-full border-4 border-blue-500/10"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin-slow"></div>
                    <div className="w-24 h-24 bg-blue-50 dark:bg-blue-900/20 rounded-full flex flex-col items-center justify-center shadow-inner">
                        <Activity className="text-blue-500 mb-1" size={20} />
                        <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Live</span>
                    </div>
                </div>

                <div className="text-center space-y-2 mb-6">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Active Session</h2>
                    <p className="text-xs text-gray-400 font-medium">Auto-sync is enabled. Control the video directly on the website.</p>
                </div>

                {/* Quick Info */}
                <div className="grid grid-cols-2 gap-3 w-full">
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-2xl flex flex-col items-center justify-center border border-gray-100 dark:border-gray-700/50">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter mb-1">Your Role</span>
                        <div className="flex items-center gap-1.5">
                            {isHost ? (
                                <><ShieldCheck size={14} className="text-orange-500" /> <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Host</span></>
                            ) : (
                                <><Activity size={14} className="text-green-500" /> <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Member</span></>
                            )}
                        </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-2xl flex flex-col items-center justify-center border border-gray-100 dark:border-gray-700/50">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter mb-1">Room Code</span>
                        <span className="text-xs font-bold text-blue-500 font-mono">{room.id}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
