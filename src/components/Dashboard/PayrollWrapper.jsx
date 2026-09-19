import React, { useState, useEffect, useMemo } from 'react';
import Payroll from './Payroll';
import { hasOwnerPrivileges } from '../../utils/authRoles';

const PayrollWrapper = () => {
  const [authUser, setAuthUser] = useState(null);
  const [attendanceRecords, setAttendanceRecords] = useState({});

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
        setAuthUser(null);
      }
    };

    checkAuthStatus();

    const handleAuthChange = () => checkAuthStatus();
    window.addEventListener('auth-changed', handleAuthChange);
    window.addEventListener('storage', handleAuthChange);

    return () => {
      window.removeEventListener('auth-changed', handleAuthChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, []);

  const isVsreOwner = useMemo(() => hasOwnerPrivileges(authUser), [authUser]);

  return (
    <Payroll
      isVsreOwner={isVsreOwner}
      attendanceRecords={attendanceRecords}
    />
  );
};

export default PayrollWrapper;
