import React from 'react';

const plans = [
  { name: 'Basic', icon: '💼', price: '₹1499/mo', color: 'from-blue-400 to-blue-600', features: ['Up to 3 events', 'Basic Reports', 'Email Support'] },
  { name: 'Premium', icon: '🚀', price: '₹2999/mo', color: 'from-pink-400 to-pink-600', features: ['Unlimited events', 'Advanced Analytics', 'Priority Support'] },
  { name: 'Enterprise', icon: '🏢', price: '₹7499/mo', color: 'from-indigo-400 to-indigo-700', features: ['Custom SLAs', 'Dedicated Manager', 'API Access'] }
];

const PlansDashboard = () => (
  <div className="min-h-screen bg-gradient-to-br from-blue-50 via-pink-50 to-indigo-100 py-8 px-2 md:px-0">
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-5 mb-10">
        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-pink-500 to-indigo-500 border-4 border-white shadow flex items-center justify-center text-3xl">
          💸
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-0">Plans & Subscriptions</h2>
          <span className="text-gray-500 text-base">Overview and management</span>
        </div>
      </div>
      <div className="mb-8 flex justify-end">
        <button className="px-5 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-pink-500 text-white font-medium shadow-lg hover:opacity-90 transition">+ Create New Plan</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
        {plans.map(plan => (
          <div key={plan.name} className={`rounded-xl shadow-lg bg-gradient-to-tr ${plan.color} p-7 flex flex-col items-center text-white hover:shadow-2xl transition`}>
            <span className="text-5xl mb-4">{plan.icon}</span>
            <div className="text-xl font-bold mb-1">{plan.name}</div>
            <div className="text-2xl font-semibold mb-2">{plan.price}</div>
            <ul className="mb-5 text-sm text-white/85 space-y-1">
              {plan.features.map(f => <li key={f}>• {f}</li>)}
            </ul>
            <button className="px-4 py-2 rounded bg-white bg-opacity-90 hover:bg-opacity-100 text-indigo-700 font-semibold shadow">Edit Plan</button>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default PlansDashboard;
