import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { hasOwnerPrivileges, getUserType, USER_TYPES } from '../../utils/authRoles';

// Lazy load all dashboard components to prevent unnecessary API calls
const VenuesDashboard = lazy(() => import('./VenuesDashboard'));
const ServiceDashboard = lazy(() => import('./ServiceDashboard'));
const ResourcesDashboard = lazy(() => import('./ResourcesDashboard'));
const StaffDashboard = lazy(() => import('./StaffDashboard'));
const StaffForHire = lazy(() => import('./StaffForHire'));
const BookingDashboard = lazy(() => import('./BookingDashboard'));
const Analytics = lazy(() => import('./Analytics'));
const Reminders = lazy(() => import('./Reminders'));
const Notifications = lazy(() => import('./Notifications'));
const StaffSchedule = lazy(() => import('./StaffSchedule'));
const Attendence = lazy(() => import('./Attendence'));
const AttendanceMaster = lazy(() => import('./AttendanceMaster'));
const PaymentMaster = lazy(() => import('./PaymentMaster'));
const UnmappedPayments = lazy(() => import('./UnmappedPayments'));
const Wallet = lazy(() => import('./Wallet'));
const CustomerPayment = lazy(() => import('./CustomerPayment'));
const Lobby = lazy(() => import('./LobbyPending'));
const EMR = lazy(() => import('./ERM'));
const CustomerMaster = lazy(() => import('./CustomerMaster'));
// const CustomerAnalytics = lazy(() => import('./CustomerAnalytics'));
const Invoices = lazy(() => import('./Invoices'));
const PayrollWrapper = lazy(() => import('./PayrollWrapper'));
const TransactionWrapper = lazy(() => import('./TransactionWrapper'));
const LocationPackage = lazy(() => import('./LocationPackage')); // Disabled for now; will use later
const N8nTemplates = lazy(() => import('./N8nTemplates'));

const sidebarItems = [
  { key: 'venues', label: <><span className="font-semibold">Venues</span></>, component: VenuesDashboard },
  { key: 'services', label: <><span className="font-semibold">Services</span></>, component: ServiceDashboard },
  { key: 'resources', label: <><span className="font-semibold">Resources</span></>, component: ResourcesDashboard },
  // EMR: in base nav for staff/manager/owner/master-admin (see filteredSidebarItems).
  { key: 'emr', label: <><span className="font-semibold">EMR</span></>, component: EMR },
  { key: 'analytics', label: <><span className="font-semibold">Analytics</span></>, component: null, hasDropdown: true },
  { key: 'manage-staff', label: <><span className="font-semibold">Manage Staff</span></>, component: null, hasDropdown: true },
];

const ownerOnlyItems = [
  { key: 'manage-customer', label: <><span className="font-semibold">Manage Customer</span></>, component: null, hasDropdown: true },
  { key: 'location-package', label: <><span className="font-semibold">Location & Package</span></>, component: LocationPackage }, // Disabled for now; will use later
  { key: 'n8n-templates', label: <><span className="font-semibold">N8N Templates</span></>, component: N8nTemplates },
];

const staffOnlyItem = {
  key: 'staff-schedule',
  label: <><span className="font-semibold">My Schedule</span></>,
  component: StaffSchedule,
};

const allSidebarItems = [...sidebarItems, staffOnlyItem, ...ownerOnlyItems, 
  { key: 'employee-master', component: StaffDashboard },
  { key: 'staffs', component: StaffDashboard },
  { key: 'manager', component: StaffDashboard },
  { key: 'reminders', component: Reminders }
];

const MainDashboard = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [authUser, setAuthUser] = useState(null);
  const [selected, setSelected] = useState('venues');
  const [manageStaffDropdown, setManageStaffDropdown] = useState(false);
  const [selectedStaffType, setSelectedStaffType] = useState(null); // 'employee-master' | 'staff-for-hire' | 'payroll' | 'attendance' | 'staff-payouts' | null
  const [manageCustomerDropdown, setManageCustomerDropdown] = useState(false);
  const [selectedCustomerType, setSelectedCustomerType] = useState(null); // 'customer-master' | 'booking' | 'customer-payment' | 'invoices' | 'lobby' | null
  const [analyticsDropdown, setAnalyticsDropdown] = useState(false);
  const [selectedAnalyticsType, setSelectedAnalyticsType] = useState(null); // 'attendance-master' | 'payment-master' | 'unmapped-payments' | 'wallet' | 'reminders' | 'notifications' | null

  useEffect(() => {
    const checkAuthStatus = () => {
      try {
        const raw = localStorage.getItem('authUser');
        if (raw) {
          const parsed = JSON.parse(raw);
          setAuthUser(parsed);
        } else {
          setAuthUser(null);
        }
      } catch (error) {
        console.error('Error parsing authUser from localStorage:', error);
        setAuthUser(null);
      }
    };

    checkAuthStatus();

    // Listen for auth changes
    const handleAuthChange = () => checkAuthStatus();
    window.addEventListener('auth-changed', handleAuthChange);
    window.addEventListener('storage', handleAuthChange);

    return () => {
      window.removeEventListener('auth-changed', handleAuthChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (manageStaffDropdown && !event.target.closest('.manage-staff-dropdown-container')) {
        setManageStaffDropdown(false);
      }
      if (manageCustomerDropdown && !event.target.closest('.manage-customer-dropdown-container')) {
        setManageCustomerDropdown(false);
      }
      if (analyticsDropdown && !event.target.closest('.analytics-dropdown-container')) {
        setAnalyticsDropdown(false);
      }
    };
    
    if (manageStaffDropdown || manageCustomerDropdown || analyticsDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [manageStaffDropdown, manageCustomerDropdown, analyticsDropdown]);

  // Filter sidebar items based on user type
  const filteredSidebarItems = useMemo(() => {
    const userType = getUserType(authUser);
    // MASTER_ADMIN and VSRE_OWNER: all tabs (base + owner-only).
    if (hasOwnerPrivileges(userType)) {
      return [...sidebarItems, ...ownerOnlyItems];
    }
    if (userType === USER_TYPES.VSRE_STAFF) {
      const base = sidebarItems.filter((item) => item.key !== 'manage-staff');
      return [...base, staffOnlyItem];
    }
    if (userType === USER_TYPES.VSRE_MANAGER) {
      // Manager can see manage-staff but only staff option
      const base = sidebarItems;
      return [...base, staffOnlyItem];
    }
    return sidebarItems;
  }, [authUser]);

  // Read section from URL parameter on mount
  useEffect(() => {
    const sectionParam = searchParams.get('section');
    if (
      sectionParam === 'manager'
      || sectionParam === 'staffs'
      || sectionParam === 'employee-master'
      || sectionParam === 'staff-for-hire'
      || sectionParam === 'payroll'
      || sectionParam === 'attendance'
      || sectionParam === 'transaction'
    ) {
      setSelected('manage-staff');
      setManageStaffDropdown(true);
      if (sectionParam === 'manager' || sectionParam === 'staffs' || sectionParam === 'employee-master') {
        setSelectedStaffType('employee-master');
        if (sectionParam === 'manager' || sectionParam === 'staffs') {
          navigate(`/dashboard?section=employee-master`, { replace: true });
        }
      } else if (sectionParam === 'staff-for-hire') {
        setSelectedStaffType('staff-for-hire');
      } else if (sectionParam === 'payroll') {
        setSelectedStaffType('payroll');
      } else if (sectionParam === 'attendance') {
        setSelectedStaffType('attendance');
      } else if (sectionParam === 'transaction') {
        setSelectedStaffType('staff-payouts');
      }
    } else if (
      sectionParam === 'customer-master' ||
      sectionParam === 'booking' ||
      sectionParam === 'customer-payment' ||
      sectionParam === 'invoices' ||
      sectionParam === 'lobby'
    ) {
      setSelected('manage-customer');
      setSelectedCustomerType(
        sectionParam === 'customer-master'
          ? 'customer-master'
          : sectionParam === 'booking'
            ? 'booking'
            : sectionParam === 'customer-payment'
              ? 'customer-payment'
              : sectionParam === 'invoices'
                ? 'invoices'
                : 'lobby'
      );
    } else if (
      sectionParam === 'attendance-master' ||
      sectionParam === 'payment-master' ||
      sectionParam === 'unmapped-payments' ||
      sectionParam === 'wallet' ||
      sectionParam === 'reminders' ||
      sectionParam === 'notifications'
      // || sectionParam === 'customer-analytics'
    ) {
      setSelected('analytics');
      setSelectedAnalyticsType(sectionParam);
    } else if (sectionParam === 'patient-master-analytics') {
      setSelected('analytics');
      setSelectedAnalyticsType('attendance-master');
      navigate(`/dashboard?section=attendance-master`, { replace: true });
    } else if (sectionParam === 'erm') {
      setSelected('emr');
    } else if (sectionParam && allSidebarItems.some(item => item.key === sectionParam)) {
      setSelected(sectionParam);
    }
  }, [searchParams]);

  // Ensure selected item is valid if manager was filtered out
  useEffect(() => {
    const sectionParamInUrl = searchParams.get('section');
    const isValid = filteredSidebarItems.some(item => item.key === selected);
    if (!isValid && filteredSidebarItems.length > 0) {
      setSelected(filteredSidebarItems[0].key);
      setSelectedStaffType(null);
      setSelectedAnalyticsType(null);
    }
    // Reset selectedStaffType if not on manage-staff
    if (selected !== 'manage-staff') {
      setSelectedStaffType(null);
    } else {
      // Default to Employee Master if manage-staff is selected but no sub-option is selected
      if (selectedStaffType === null) {
        setSelectedStaffType('employee-master');
        setManageStaffDropdown(true);
        navigate(`/dashboard?section=employee-master`, { replace: true });
      } else if (selectedStaffType === 'manager' || selectedStaffType === 'staff') {
        // Legacy Staff / Manager tabs → Employee Master
        setSelectedStaffType('employee-master');
        setManageStaffDropdown(true);
        navigate(`/dashboard?section=employee-master`, { replace: true });
      } else {
        // Keep dropdown open if a sub-option is already selected
        setManageStaffDropdown(true);
      }
    }
    // Reset selectedCustomerType if not on manage-customer
    if (selected !== 'manage-customer') {
      setSelectedCustomerType(null);
    } else {
      // Default to 'booking' if manage-customer is selected but no sub-option is selected
      if (selectedCustomerType === null) {
        const nextCustomerType =
          sectionParamInUrl === 'customer-master' ||
          sectionParamInUrl === 'customer-payment' ||
          sectionParamInUrl === 'invoices' ||
          sectionParamInUrl === 'lobby'
            ? sectionParamInUrl
            : 'booking';
        setSelectedCustomerType(nextCustomerType);
        navigate(`/dashboard?section=${nextCustomerType}`, { replace: true });
      }
    }
    const analyticsSections = new Set([
      'attendance-master',
      'payment-master',
      'unmapped-payments',
      'wallet',
      'reminders',
      'notifications',
      // 'customer-analytics',
    ]);

    // Reset selectedAnalyticsType if not on analytics
    if (selected !== 'analytics') {
      setSelectedAnalyticsType(null);
    } else {
      // If URL explicitly targets an analytics section, always honor that.
      if (sectionParamInUrl && analyticsSections.has(sectionParamInUrl)) {
        if (selectedAnalyticsType !== sectionParamInUrl) {
          setSelectedAnalyticsType(sectionParamInUrl);
        }
        return;
      }
      // Default to Attendance Master when Analytics is selected
      if (selectedAnalyticsType === null) {
        setSelectedAnalyticsType('attendance-master');
        navigate(`/dashboard?section=attendance-master`, { replace: true });
      }
    }
  }, [filteredSidebarItems, navigate, searchParams, selected, selectedAnalyticsType, selectedCustomerType, selectedStaffType]);

  // Determine which component to render
  const SelectedComponent = useMemo(() => {
    if (selected === 'manage-staff') {
      const staffType = selectedStaffType || 'employee-master';
      if (staffType === 'payroll') {
        return PayrollWrapper;
      } else if (staffType === 'attendance') {
        return Attendence;
      } else if (staffType === 'staff-payouts') {
        return TransactionWrapper;
      } else if (staffType === 'staff-for-hire') {
        return StaffForHire;
      } else {
        return StaffDashboard;
      }
    }
    if (selected === 'manage-customer') {
      const customerType = selectedCustomerType || 'booking';
      if (customerType === 'customer-master') return CustomerMaster;
      if (customerType === 'customer-payment') return CustomerPayment;
      if (customerType === 'invoices') return Invoices;
      if (customerType === 'lobby') return Lobby;
      return BookingDashboard;
    }
    if (selected === 'analytics') {
      // Default Analytics overview when no sub-section selected
      if (!selectedAnalyticsType) {
        return Analytics;
      }
      if (selectedAnalyticsType === 'attendance-master') return AttendanceMaster;
      if (selectedAnalyticsType === 'payment-master') return PaymentMaster;
      if (selectedAnalyticsType === 'unmapped-payments') return UnmappedPayments;
      if (selectedAnalyticsType === 'wallet') return Wallet;
      if (selectedAnalyticsType === 'reminders') return Reminders;
      if (selectedAnalyticsType === 'notifications') return Notifications;
      // if (selectedAnalyticsType === 'customer-analytics') return CustomerAnalytics;
      return Analytics;
    }
    return filteredSidebarItems.find(item => item.key === selected)?.component || (() => null);
  }, [selected, selectedStaffType, selectedCustomerType, selectedAnalyticsType, filteredSidebarItems]);

  return (
    <div>
      {/* Main dashboard title - white card, centered, italic */}
      <div className="w-full flex justify-center">
      <h2 className="bg-white text-black text-center font-bold italic py-1 w-full">
        Admin Dashboard
      </h2>
      </div>
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-pink-50 py-2 px-2 md:px-0">
        <div className="mx-auto min-w-0 max-w-6xl">
          <div className="grid gap-8 md:grid-cols-5">
            {/* Sidebar - make it a white rounded card to match panel */}
            <aside className="md:col-span-1">
              <div className="rounded-2xl shadow bg-white border border-gray-100 px-5 py-8 flex flex-col gap-2 md:min-h-[400px] mt-0">
                {filteredSidebarItems.map(item => {
                  const isManageStaff = item.key === 'manage-staff';
                  const isManageCustomer = item.key === 'manage-customer';
                  const isAnalytics = item.key === 'analytics';
                  // For dropdowns, only highlight if a sub-option is selected
                  const isSelected = isManageStaff 
                    ? (selected === item.key && selectedStaffType !== null)
                    : isManageCustomer
                    ? (selected === item.key && selectedCustomerType !== null)
                    : isAnalytics
                    ? (selected === item.key && selectedAnalyticsType !== null)
                    : selected === item.key;
                  const isDropdownOpen = isManageStaff 
                    ? manageStaffDropdown 
                    : isManageCustomer
                    ? manageCustomerDropdown
                    : isAnalytics 
                    ? analyticsDropdown 
                    : false;
                  
                  // Employee Master replaces former Staff + Manager tabs
                  return (
                    <div 
                      key={item.key} 
                      className={`relative ${isManageStaff ? 'manage-staff-dropdown-container' : ''}${isManageCustomer ? 'manage-customer-dropdown-container' : ''}${isAnalytics ? 'analytics-dropdown-container' : ''}`}
                    >
                      <button
                        onClick={() => {
                          if (isManageStaff) {
                            setManageStaffDropdown(!manageStaffDropdown);
                            setAnalyticsDropdown(false);
                            setManageCustomerDropdown(false);
                          } else if (isManageCustomer) {
                            setManageCustomerDropdown(!manageCustomerDropdown);
                            setManageStaffDropdown(false);
                            setAnalyticsDropdown(false);
                          } else if (isAnalytics) {
                            setAnalyticsDropdown(!analyticsDropdown);
                            setManageStaffDropdown(false);
                            setManageCustomerDropdown(false);
                            setSelected('analytics');
                            if (selectedAnalyticsType === null) {
                              setSelectedAnalyticsType('attendance-master');
                              navigate(`/dashboard?section=attendance-master`, { replace: true });
                            }
                          } else {
                            setManageStaffDropdown(false);
                            setManageCustomerDropdown(false);
                            setAnalyticsDropdown(false);
                            setSelected(item.key);
                            setSelectedStaffType(null);
                            setSelectedCustomerType(null);
                            setSelectedAnalyticsType(null);
                            navigate(`/dashboard?section=${item.key}`, { replace: true });
                          }
                        }}
                        className={
                          'w-full text-left px-3 py-0.5 rounded-lg mb-1 text-sm focus:outline-none transition-all flex items-center justify-between ' +
                          (isSelected
                            ? 'font-bold bg-linear-to-r from-indigo-100 via-blue-100 to-pink-100 border-l-4 border-indigo-400 text-indigo-700 shadow-sm'
                            : 'font-normal text-gray-700 hover:bg-blue-50')
                        }
                      >
                        <span>{item.label}</span>
                        {(isManageStaff || isManageCustomer || isAnalytics) && (
                          <svg
                            className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </button>
                      {isManageStaff && isDropdownOpen && (
                        <div className="ml-4 mt-1 mb-1 space-y-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected('manage-staff');
                              setSelectedStaffType('employee-master');
                              setManageStaffDropdown(true);
                              navigate(`/dashboard?section=employee-master`, { replace: true });
                            }}
                            className={
                              'w-full text-left px-3 py-0.5 rounded-lg text-xs focus:outline-none transition-all ' +
                              (selectedStaffType === 'employee-master'
                                ? 'font-semibold bg-indigo-50 text-indigo-700 border-l-2 border-indigo-400'
                                : 'font-normal text-gray-600 hover:bg-gray-50')
                            }
                          >
                            Employee Master
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected('manage-staff');
                              setSelectedStaffType('attendance');
                              setManageStaffDropdown(true);
                              navigate(`/dashboard?section=attendance`, { replace: true });
                            }}
                            className={
                              'w-full text-left px-3 py-0.5 rounded-lg text-xs focus:outline-none transition-all ' +
                              (selectedStaffType === 'attendance'
                                ? 'font-semibold bg-indigo-50 text-indigo-700 border-l-2 border-indigo-400'
                                : 'font-normal text-gray-600 hover:bg-gray-50')
                            }
                          >
                            Attendance
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected('manage-staff');
                              setSelectedStaffType('payroll');
                              setManageStaffDropdown(true);
                              navigate(`/dashboard?section=payroll`, { replace: true });
                            }}
                            className={
                              'w-full text-left px-3 py-0.5 rounded-lg text-xs focus:outline-none transition-all ' +
                              (selectedStaffType === 'payroll'
                                ? 'font-semibold bg-indigo-50 text-indigo-700 border-l-2 border-indigo-400'
                                : 'font-normal text-gray-600 hover:bg-gray-50')
                            }
                          >
                            Payroll
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected('manage-staff');
                              setSelectedStaffType('staff-payouts');
                              setManageStaffDropdown(true);
                              navigate(`/dashboard?section=transaction`, { replace: true });
                            }}
                            className={
                              'w-full text-left px-3 py-0.5 rounded-lg text-xs focus:outline-none transition-all ' +
                              (selectedStaffType === 'staff-payouts'
                                ? 'font-semibold bg-indigo-50 text-indigo-700 border-l-2 border-indigo-400'
                                : 'font-normal text-gray-600 hover:bg-gray-50')
                            }
                          >
                            Staff Payouts
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected('manage-staff');
                              setSelectedStaffType('staff-for-hire');
                              setManageStaffDropdown(true);
                              navigate(`/dashboard?section=staff-for-hire`, { replace: true });
                            }}
                            className={
                              'w-full text-left px-3 py-0.5 rounded-lg text-xs focus:outline-none transition-all ' +
                              (selectedStaffType === 'staff-for-hire'
                                ? 'font-semibold bg-indigo-50 text-indigo-700 border-l-2 border-indigo-400'
                                : 'font-normal text-gray-600 hover:bg-gray-50')
                            }
                          >
                            Staff for hire
                          </button>
                        </div>
                      )}
                      {isManageCustomer && isDropdownOpen && (
                        <div className="ml-4 mt-1 mb-1 space-y-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected('manage-customer');
                              setSelectedCustomerType('customer-master');
                              navigate(`/dashboard?section=customer-master`, { replace: true });
                            }}
                            className={
                              'w-full text-left px-3 py-0.5 rounded-lg text-xs focus:outline-none transition-all ' +
                              (selectedCustomerType === 'customer-master'
                                ? 'font-semibold bg-indigo-50 text-indigo-700 border-l-2 border-indigo-400'
                                : 'font-normal text-gray-600 hover:bg-gray-50')
                            }
                          >
                            Customer Master
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected('manage-customer');
                              setSelectedCustomerType('booking');
                              navigate(`/dashboard?section=booking`, { replace: true });
                            }}
                            className={
                              'w-full text-left px-3 py-0.5 rounded-lg text-xs focus:outline-none transition-all ' +
                              (selectedCustomerType === 'booking'
                                ? 'font-semibold bg-indigo-50 text-indigo-700 border-l-2 border-indigo-400'
                                : 'font-normal text-gray-600 hover:bg-gray-50')
                            }
                          >
                            Booking
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected('manage-customer');
                              setSelectedCustomerType('lobby');
                              navigate(`/dashboard?section=lobby`, { replace: true });
                            }}
                            className={
                              'w-full text-left px-3 py-0.5 rounded-lg text-xs focus:outline-none transition-all ' +
                              (selectedCustomerType === 'lobby'
                                ? 'font-semibold bg-indigo-50 text-indigo-700 border-l-2 border-indigo-400'
                                : 'font-normal text-gray-600 hover:bg-gray-50')
                            }
                          >
                            Lobby
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected('manage-customer');
                              setSelectedCustomerType('invoices');
                              navigate(`/dashboard?section=invoices`, { replace: true });
                            }}
                            className={
                              'w-full text-left px-3 py-0.5 rounded-lg text-xs focus:outline-none transition-all ' +
                              (selectedCustomerType === 'invoices'
                                ? 'font-semibold bg-indigo-50 text-indigo-700 border-l-2 border-indigo-400'
                                : 'font-normal text-gray-600 hover:bg-gray-50')
                            }
                          >
                            Invoices
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected('manage-customer');
                              setSelectedCustomerType('customer-payment');
                              navigate(`/dashboard?section=customer-payment`, { replace: true });
                            }}
                            className={
                              'w-full text-left px-3 py-0.5 rounded-lg text-xs focus:outline-none transition-all ' +
                              (selectedCustomerType === 'customer-payment'
                                ? 'font-semibold bg-indigo-50 text-indigo-700 border-l-2 border-indigo-400'
                                : 'font-normal text-gray-600 hover:bg-gray-50')
                            }
                          >
                            Payment
                          </button>
                        </div>
                      )}
                      {isAnalytics && isDropdownOpen && (
                        <div className="ml-4 mt-1 mb-1 space-y-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected('analytics');
                              setSelectedAnalyticsType('attendance-master');
                              setAnalyticsDropdown(false);
                              navigate(`/dashboard?section=attendance-master`, { replace: true });
                            }}
                            className={
                              'w-full text-left px-3 py-0.5 rounded-lg text-xs focus:outline-none transition-all ' +
                              (selectedAnalyticsType === 'attendance-master'
                                ? 'font-semibold bg-indigo-50 text-indigo-700 border-l-2 border-indigo-400'
                                : 'font-normal text-gray-600 hover:bg-gray-50')
                            }
                          >
                            Attendance Master
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected('analytics');
                              setSelectedAnalyticsType('reminders');
                              setAnalyticsDropdown(false);
                              navigate(`/dashboard?section=reminders`, { replace: true });
                            }}
                            className={
                              'w-full text-left px-3 py-0.5 rounded-lg text-xs focus:outline-none transition-all ' +
                              (selectedAnalyticsType === 'reminders'
                                ? 'font-semibold bg-indigo-50 text-indigo-700 border-l-2 border-indigo-400'
                                : 'font-normal text-gray-600 hover:bg-gray-50')
                            }
                          >
                            Reminders
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected('analytics');
                              setSelectedAnalyticsType('payment-master');
                              setAnalyticsDropdown(false);
                              navigate(`/dashboard?section=payment-master`, { replace: true });
                            }}
                            className={
                              'w-full text-left px-3 py-0.5 rounded-lg text-xs focus:outline-none transition-all ' +
                              (selectedAnalyticsType === 'payment-master'
                                ? 'font-semibold bg-indigo-50 text-indigo-700 border-l-2 border-indigo-400'
                                : 'font-normal text-gray-600 hover:bg-gray-50')
                            }
                          >
                            Payment Master
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected('analytics');
                              setSelectedAnalyticsType('unmapped-payments');
                              setAnalyticsDropdown(false);
                              navigate(`/dashboard?section=unmapped-payments`, { replace: true });
                            }}
                            className={
                              'w-full text-left px-3 py-0.5 rounded-lg text-xs focus:outline-none transition-all ' +
                              (selectedAnalyticsType === 'unmapped-payments'
                                ? 'font-semibold bg-indigo-50 text-indigo-700 border-l-2 border-indigo-400'
                                : 'font-normal text-gray-600 hover:bg-gray-50')
                            }
                          >
                            Unmapped Payments
                          </button>
                          {/* <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected('analytics');
                              setSelectedAnalyticsType('wallet');
                              setAnalyticsDropdown(false);
                              navigate(`/dashboard?section=wallet`, { replace: true });
                            }}
                            className={
                              'w-full text-left px-3 py-0.5 rounded-lg text-xs focus:outline-none transition-all ' +
                              (selectedAnalyticsType === 'wallet'
                                ? 'font-semibold bg-indigo-50 text-indigo-700 border-l-2 border-indigo-400'
                                : 'font-normal text-gray-600 hover:bg-gray-50')
                            }
                          >
                            Wallet
                          </button> */}
                          {/* <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected('analytics');
                              setSelectedAnalyticsType('customer-analytics');
                              setAnalyticsDropdown(false);
                              navigate(`/dashboard?section=customer-analytics`, { replace: true });
                            }}
                            className={
                              'w-full text-left px-3 py-0.5 rounded-lg text-xs focus:outline-none transition-all ' +
                              (selectedAnalyticsType === 'customer-analytics'
                                ? 'font-semibold bg-indigo-50 text-indigo-700 border-l-2 border-indigo-400'
                                : 'font-normal text-gray-600 hover:bg-gray-50')
                            }
                          >
                            Customer Analytics
                          </button> */}
                          {/* <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected('analytics');
                              setSelectedAnalyticsType('notifications');
                              setAnalyticsDropdown(false);
                              navigate(`/dashboard?section=notifications`, { replace: true });
                            }}
                            className={
                              'w-full text-left px-3 py-0.5 rounded-lg text-xs focus:outline-none transition-all ' +
                              (selectedAnalyticsType === 'notifications'
                                ? 'font-semibold bg-indigo-50 text-indigo-700 border-l-2 border-indigo-400'
                                : 'font-normal text-gray-600 hover:bg-gray-50')
                            }
                          >
                            Notifications
                          </button> */}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>
            {/* Main Section - wrap content in similar white rounded card */}
            <main className="flex min-w-0 max-w-full flex-col gap-7 md:col-span-4">
              <div className="mt-0 min-w-0 max-w-full rounded-2xl border border-gray-200 bg-white p-2 shadow-md sm:p-3 md:mt-0">
                <Suspense fallback={<div className="flex items-center justify-center p-8"><div className="text-gray-500">Loading...</div></div>}>
                  <SelectedComponent />
                </Suspense>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainDashboard;
