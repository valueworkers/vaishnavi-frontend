import React from 'react';

const resources = [
  { name: 'Projector', img: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?q=80&w=400', status: 'In Use' },
  { name: 'Sound System', img: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?q=80&w=400', status: 'Available' },
  { name: 'Banquet Table', img: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?q=80&w=400', status: 'Maintenance' },
];

const ResourcesDashboard = () => (
  <div className="flex flex-col items-center justify-center py-12">
    <div className="w-full max-w-md rounded-xl shadow-lg bg-white border border-blue-100 px-8 py-10 text-center">
      <div className="flex items-center justify-center mb-6">
        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-400 to-pink-400 flex items-center justify-center">
          <span className="text-3xl">🛎️</span>
        </div>
      </div>
      <h2 className="text-xl font-bold text-blue-700 mb-2">Resources Panel</h2>
      <div className="text-gray-500">View and manage all your resources.</div>
    </div>
  </div>
);

export default ResourcesDashboard;
