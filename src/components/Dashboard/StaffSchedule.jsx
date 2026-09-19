import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const scheduleTypes = [
  { value: 'leave', label: 'Leave' },
  { value: 'work', label: 'Assigned Work' },
];

const tabs = [
  { key: 'calendar', label: 'Calendar' },
  { key: 'work', label: 'My Work' },
  { key: 'manager', label: 'Reporting Manager' },
];

const StaffSchedule = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [formState, setFormState] = useState({ type: 'leave', note: '' });
  const [entries, setEntries] = useState({});
  const [managerInfo, setManagerInfo] = useState(() => {
    try {
      const stored = localStorage.getItem('assignedManager');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  });
  const [activeTab, setActiveTab] = useState('calendar');
  const [attendanceStatuses, setAttendanceStatuses] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState({}); // { dateKey: 'present' | 'absent' | 'halfday' | 'paidleave' }
  const [openDropdownDate, setOpenDropdownDate] = useState(null); // Track which date's dropdown is open
  const [authUser, setAuthUser] = useState(null);
  const [isMarkingAttendance, setIsMarkingAttendance] = useState(false);
  const [attendanceMessage, setAttendanceMessage] = useState({ type: '', text: '' });

  const monthMeta = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    return {
      daysInMonth: lastDay.getDate(),
      startingDay: firstDay.getDay(),
    };
  }, [currentMonth]);

  const handleDayClick = (day) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    setSelectedDate(date.toDateString());
    const existing = entries[date.toDateString()];
    setFormState({
      type: existing?.type || 'leave',
      note: existing?.note || '',
    });
  };

  const handleSaveEntry = () => {
    if (!selectedDate) return;
    setEntries((prev) => ({
      ...prev,
      [selectedDate]: { ...formState },
    }));
    setSelectedDate(null);
    setFormState({ type: 'leave', note: '' });
  };

  const handleRemoveEntry = (dateKey) => {
    setEntries((prev) => {
      const copy = { ...prev };
      delete copy[dateKey];
      return copy;
    });
    if (selectedDate === dateKey) {
      setSelectedDate(null);
      setFormState({ type: 'leave', note: '' });
    }
  };

  // Check if current month is the present month or a future month
  const isCurrentOrFutureMonth = useMemo(() => {
    const today = new Date();
    const currentYear = currentMonth.getFullYear();
    const currentMonthNum = currentMonth.getMonth();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    
    // If viewing a future year, disable next
    if (currentYear > todayYear) return true;
    // If viewing current year and current or future month, disable next
    if (currentYear === todayYear && currentMonthNum >= todayMonth) return true;
    return false;
  }, [currentMonth]);

  const goToMonth = async (direction) => {
    // Prevent navigation while marking attendance
    if (isMarkingAttendance) {
      return;
    }
    
    // Prevent going to future months
    if (direction > 0 && isCurrentOrFutureMonth) {
      return;
    }
    
    setSelectedDate(null);
    setFormState({ type: 'leave', note: '' });
    setOpenDropdownDate(null);
    
    // Calculate the new month
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(currentMonth.getMonth() + direction);
    setCurrentMonth(newMonth);
    
    // Fetch attendance data for the new month if calendar tab is active and user is logged in
    if (activeTab === 'calendar' && authUser?.id) {
      const year = newMonth.getFullYear();
      const monthNum = newMonth.getMonth();
      const startDate = `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(new Date(year, monthNum + 1, 0).getDate()).padStart(2, '0')}`;
      
      try {
        const records = await fetchUserAttendance(authUser.id, startDate, endDate);
        setAttendanceRecords(records);
      } catch (error) {
        // Error handled silently
      }
    }
  };

  // Format date to YYYY-MM-DD using local timezone
  const formatDateKey = (date) => {
    if (date instanceof Date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    if (typeof date === 'string') {
      return date.split('T')[0];
    }
    return date;
  };

  // Extract array from API response
  const extractArray = (payload) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.data?.results)) return payload.data.results;
    return [];
  };

  // Map API status code to internal status value
  const mapStatusCodeToStatus = (code) => {
    const codeMap = {
      'PRESENT': 'present',
      'ABSENT': 'absent',
      'HALF-DAY': 'halfday',
      'PAID-LEAVE': 'paidleave',
    };
    return codeMap[code] || code.toLowerCase().replace('-', '');
  };

  // Get status ID from status code/value
  const getStatusId = (statusValue) => {
    // Map internal status value to status code
    const statusCodeMap = {
      'present': 'PRESENT',
      'absent': 'ABSENT',
      'halfday': 'HALF-DAY',
      'paidleave': 'PAID-LEAVE',
    };
    
    const statusCode = statusCodeMap[statusValue];
    if (!statusCode) return null;
    
    // Find the status ID from attendanceStatuses array
    const statusItem = attendanceStatuses.find(s => s.code === statusCode && s.is_active);
    return statusItem?.id || null;
  };

  // Get month dates
  const getMonthDates = (month) => {
    const year = month.getFullYear();
    const monthNum = month.getMonth();
    const daysInMonth = new Date(year, monthNum + 1, 0).getDate();
    const dates = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, monthNum, day);
      dates.push(date);
    }
    
    return dates;
  };

  // Get attendance status for a date
  const getAttendanceStatus = (dateKey) => {
    return attendanceRecords[dateKey] || null;
  };

  // Check if date is in current month
  const isDateInCurrentMonth = (date) => {
    return date.getMonth() === currentMonth.getMonth() && 
           date.getFullYear() === currentMonth.getFullYear();
  };

  // Get main statuses (PRESENT and ABSENT) and dropdown statuses (others)
  const mainStatuses = useMemo(() => {
    return attendanceStatuses.filter(s => s.code === 'PRESENT' || s.code === 'ABSENT');
  }, [attendanceStatuses]);

  const dropdownStatuses = useMemo(() => {
    return attendanceStatuses.filter(s => s.code !== 'PRESENT' && s.code !== 'ABSENT');
  }, [attendanceStatuses]);

  // Get attendance summary
  const getAttendanceSummary = () => {
    const monthDates = getMonthDates(currentMonth);
    const summary = { present: 0, absent: 0, halfday: 0, paidleave: 0 };
    
    monthDates.forEach(date => {
      const dateKey = formatDateKey(date);
      const status = getAttendanceStatus(dateKey);
      if (status === 'present') summary.present++;
      else if (status === 'absent') summary.absent++;
      else if (status === 'halfday') summary.halfday++;
      else if (status === 'paidleave') summary.paidleave++;
    });
    
    return summary;
  };

  // Fetch attendance data for current user from API
  const fetchUserAttendance = async (userId, startDate, endDate) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      return {};
    }

    if (!userId || !startDate || !endDate) {
      return {};
    }

    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const apiUrl = `${baseUrl}/attendance/attendance/`;
      const params = {
        user_id: userId,
        start_date: startDate,
        end_date: endDate,
      };
      
      const response = await axios.get(apiUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: params,
      });
      
      // Extract array from response
      const attendanceData = extractArray(response.data);
      
      // Map API response to internal format: { date: status }
      const mappedRecords = {};
      attendanceData.forEach((record) => {
        if (record.date) {
          let statusValue = null;
          
          if (record.status_code) {
            statusValue = mapStatusCodeToStatus(record.status_code);
          } else if (record.status_label) {
            const labelMap = {
              'Present': 'present',
              'Absent': 'absent',
              'Half-day': 'halfday',
              'Half Day': 'halfday',
              'Paid Leave': 'paidleave',
              'Paid-Leave': 'paidleave',
            };
            statusValue = labelMap[record.status_label] || record.status_label.toLowerCase().replace(/\s+/g, '');
          }
          
          if (statusValue) {
            mappedRecords[record.date] = statusValue;
          }
        }
      });
      
      return mappedRecords;
    } catch (error) {
      return {};
    }
  };

  // POST API to mark attendance
  const postAttendance = async (userId, date, statusId) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      return false;
    }

    if (!userId || !date || !statusId) {
      return false;
    }

    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const apiUrl = `${baseUrl}/attendance/attendance/`;
      const payload = {
        user: userId,
        date: date,
        status: statusId,
      };
      
      await axios.post(apiUrl, payload, {
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      return true;
    } catch (error) {
      return false;
    }
  };

  // Mark attendance
  const markAttendance = async (date, status) => {
    if (!authUser?.id) {
      return;
    }
    
    // Only allow marking attendance for dates in the current month
    if (!isDateInCurrentMonth(date)) {
      return;
    }
    
    // Prevent multiple simultaneous API calls
    if (isMarkingAttendance) {
      return;
    }
    
    const dateKey = formatDateKey(date);
    
    // Get status ID from attendance statuses
    const statusId = getStatusId(status);
    if (!statusId) {
      setAttendanceMessage({ type: 'error', text: 'Error: Could not find attendance status. Please refresh the page.' });
      setTimeout(() => setAttendanceMessage({ type: '', text: '' }), 5000);
      return;
    }
    
    // Set loading state
    setIsMarkingAttendance(true);
    setAttendanceMessage({ type: '', text: '' });
    
    // Update UI optimistically
    setAttendanceRecords((prev) => ({
      ...prev,
      [dateKey]: status,
    }));
    
    try {
      // Post to API
      const success = await postAttendance(authUser.id, dateKey, statusId);
      
      if (success) {
        // Show success message
        const statusLabel = attendanceStatuses.find(s => mapStatusCodeToStatus(s.code) === status)?.label || status.toUpperCase();
        setAttendanceMessage({ type: 'success', text: `Attendance marked as ${statusLabel} successfully!` });
        setTimeout(() => setAttendanceMessage({ type: '', text: '' }), 3000);
      } else {
        // Revert UI change if API call failed
        setAttendanceRecords((prev) => {
          const updated = { ...prev };
          delete updated[dateKey];
          return updated;
        });
        setAttendanceMessage({ type: 'error', text: 'Failed to mark attendance. Please try again.' });
        setTimeout(() => setAttendanceMessage({ type: '', text: '' }), 5000);
      }
    } catch (error) {
      // Revert UI change
      setAttendanceRecords((prev) => {
        const updated = { ...prev };
        delete updated[dateKey];
        return updated;
      });
      setAttendanceMessage({ type: 'error', text: 'An error occurred. Please try again.' });
      setTimeout(() => setAttendanceMessage({ type: '', text: '' }), 5000);
    } finally {
      setIsMarkingAttendance(false);
    }
  };

  // Unmark attendance
  const unmarkAttendance = (date) => {
    const dateKey = formatDateKey(date);
    setAttendanceRecords((prev) => {
      const updated = { ...prev };
      delete updated[dateKey];
      return updated;
    });
  };

  const calendarDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < monthMeta.startingDay; i++) {
      days.push({ empty: true, key: `empty-${i}` });
    }
    for (let day = 1; day <= monthMeta.daysInMonth; day++) {
      const dateKey = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toDateString();
      days.push({
        day,
        key: dateKey,
        entry: entries[dateKey],
      });
    }
    return days;
  }, [currentMonth, monthMeta, entries]);

  const workEntries = useMemo(() => {
    return Object.entries(entries)
      .filter(([, entry]) => entry?.type === 'work')
      .sort((a, b) => new Date(a[0]) - new Date(b[0]));
  }, [entries]);

  // Fetch attendance statuses from API
  const fetchAttendanceStatuses = async () => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      return;
    }

    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const apiUrl = `${baseUrl}/attendance/attendance-status/`;
      
      const response = await axios.get(apiUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      // Extract results array from response
      const results = extractArray(response.data);
      const activeStatuses = results.filter(s => s.is_active);
      setAttendanceStatuses(activeStatuses);
    } catch (error) {
      setAttendanceStatuses([]);
    }
  };

  // Get current user from localStorage
  useEffect(() => {
    try {
      const rawAuth = localStorage.getItem('authUser');
      if (rawAuth) {
        const parsed = JSON.parse(rawAuth);
        setAuthUser(parsed);
      }
    } catch (error) {
      // Error handled silently
    }
  }, []);

  // Fetch attendance data when calendar tab is active or month changes
  useEffect(() => {
    if (activeTab === 'calendar' && authUser?.id) {
      fetchAttendanceStatuses();
      
      // Calculate start and end dates for the current month
      const year = currentMonth.getFullYear();
      const monthNum = currentMonth.getMonth();
      const startDate = `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(new Date(year, monthNum + 1, 0).getDate()).padStart(2, '0')}`;
      
      // Fetch attendance data
      fetchUserAttendance(authUser.id, startDate, endDate).then((records) => {
        setAttendanceRecords(records);
      });
    }
  }, [activeTab, currentMonth, authUser?.id]);

  useEffect(() => {
    try {
      const rawAuth = localStorage.getItem('authUser');
      if (!rawAuth) return;
      const parsed = JSON.parse(rawAuth);
      if (parsed?.reporting_manager_details) {
        const mgr = parsed.reporting_manager_details;
        setManagerInfo({
          name: mgr.name || 'Reporting Manager',
          email: mgr.email || mgr.contact_email || '',
          phone: mgr.phone || mgr.contact_number || '',
          department: mgr.department || mgr.role || '',
          photo: mgr.photo || null,
        });
        return;
      }
      if (parsed?.reporting_manager_name) {
        setManagerInfo({
          name: parsed.reporting_manager_name,
          email: parsed.reporting_manager_email || '',
          phone: parsed.reporting_manager_phone || '',
          department: parsed.reporting_manager_department || '',
          photo: parsed.reporting_manager_photo || null,
        });
      }
    } catch (error) {
      // Error handled silently
    }
  }, []);

  const renderCalendarSection = () => {
    const monthDates = getMonthDates(currentMonth);
    const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const monthShort = currentMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const summary = getAttendanceSummary();

    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        {/* Month Navigation */}
        <div className="flex items-center justify-end gap-2 mb-6">
          <button
            onClick={() => goToMonth(-1)}
            disabled={isMarkingAttendance}
            className={`px-3 py-1 rounded font-semibold transition-colors ${
              isMarkingAttendance
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            &lt;
          </button>
          <span className="px-4 py-1 text-gray-900 font-semibold">{monthShort}</span>
          <button
            onClick={() => goToMonth(1)}
            disabled={isMarkingAttendance || isCurrentOrFutureMonth}
            className={`px-3 py-1 rounded font-semibold transition-colors ${
              isMarkingAttendance || isCurrentOrFutureMonth
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            &gt;
          </button>
        </div>

        {/* Attendance Summary */}
        <div className="mb-6 space-y-2">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-700">Present (P):</span>
              <span className="font-bold text-gray-900">{summary.present}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-700">Absent (A):</span>
              <span className="font-bold text-gray-900">{summary.absent}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-700">Half day (HD):</span>
              <span className="font-bold text-gray-900">{summary.halfday}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-700">Paid Leave (PL):</span>
              <span className="font-bold text-gray-900">{summary.paidleave}</span>
            </div>
          </div>
        </div>

        {/* Daily Attendance Log */}
        <div className="border-t border-gray-200 pt-4">
          <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
            <div className="font-semibold text-gray-900 text-sm uppercase tracking-wide">DATE</div>
            <div className="font-semibold text-gray-900 text-sm uppercase tracking-wide">ATTENDANCE</div>
          </div>
          <div className="mt-2 space-y-2 max-h-[400px] overflow-y-auto">
            {monthDates.map((date) => {
              const dateKey = formatDateKey(date);
              const status = getAttendanceStatus(dateKey);
              const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
              const isDropdownOpen = openDropdownDate === dateKey;
              const isInCurrentMonth = isDateInCurrentMonth(date);
              
              return (
                <div key={dateKey} className="grid grid-cols-[1fr_auto] gap-4 items-center py-2 border-b border-gray-100 relative">
                  <div className={`text-sm ${isInCurrentMonth ? 'text-gray-700' : 'text-gray-400'}`}>{dateStr}</div>
                  <div className="flex items-center gap-2 dropdown-container">
                    {/* Main status buttons (PRESENT and ABSENT) */}
                    {mainStatuses.map((statusItem) => {
                      const statusValue = mapStatusCodeToStatus(statusItem.code);
                      const isActive = status === statusValue;
                      const isPresent = statusItem.code === 'PRESENT';
                      const isAbsent = statusItem.code === 'ABSENT';
                      
                      return (
                        <button
                          key={statusItem.id}
                          onClick={() => {
                            if (!isInCurrentMonth) return;
                            if (isActive) {
                              unmarkAttendance(date);
                            } else {
                              markAttendance(date, statusValue);
                            }
                            setOpenDropdownDate(null);
                          }}
                          onDoubleClick={(e) => {
                            if (!isInCurrentMonth) return;
                            e.preventDefault();
                            e.stopPropagation();
                            unmarkAttendance(date);
                          }}
                          disabled={!isInCurrentMonth || isMarkingAttendance}
                          className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                            !isInCurrentMonth || isMarkingAttendance
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                              : isActive
                              ? isPresent
                                ? 'bg-green-600 text-white'
                                : 'bg-red-600 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          {statusItem.label}
                        </button>
                      );
                    })}
                    
                    {/* Dropdown for other statuses */}
                    {dropdownStatuses.length > 0 && (
                      <div className="relative">
                        <button
                          onClick={() => {
                            if (!isInCurrentMonth) return;
                            setOpenDropdownDate(isDropdownOpen ? null : dateKey);
                          }}
                          disabled={!isInCurrentMonth || isMarkingAttendance}
                          className={`px-2 py-1 ${!isInCurrentMonth || isMarkingAttendance ? 'text-gray-300 cursor-not-allowed opacity-50' : isDropdownOpen ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        </button>
                        {isDropdownOpen && isInCurrentMonth && (
                          <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                            {dropdownStatuses.map((statusItem) => {
                              const statusValue = mapStatusCodeToStatus(statusItem.code);
                              const isActive = status === statusValue;
                              const isHalfDay = statusItem.code === 'HALF-DAY';
                              
                              return (
                                <button
                                  key={statusItem.id}
                                  onClick={() => {
                                    if (!isMarkingAttendance) {
                                      markAttendance(date, statusValue);
                                      setOpenDropdownDate(null);
                                    }
                                  }}
                                  disabled={isMarkingAttendance}
                                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                                    isMarkingAttendance
                                      ? 'text-gray-400 cursor-not-allowed opacity-50'
                                      : isActive 
                                        ? isHalfDay 
                                          ? 'bg-yellow-50 text-yellow-700 font-semibold hover:bg-yellow-100' 
                                          : 'bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100'
                                        : 'text-gray-700 hover:bg-gray-50'
                                  }`}
                                >
                                  {statusItem.code === 'HALF-DAY' ? 'Half-day' : statusItem.code === 'PAID-LEAVE' ? 'Paid-Leave' : statusItem.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Show label for dropdown statuses when active */}
                    {dropdownStatuses.some(s => mapStatusCodeToStatus(s.code) === status) && (
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        status === 'halfday' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {dropdownStatuses.find(s => mapStatusCodeToStatus(s.code) === status)?.label || status}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderWorkSection = () => (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">My Work</h3>
          <p className="text-sm text-gray-500">Upcoming assignments logged in the calendar.</p>
        </div>
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          {workEntries.length} task{workEntries.length === 1 ? '' : 's'}
        </span>
      </div>
      {workEntries.length === 0 ? (
        <p className="text-sm text-gray-500">No assignments yet. Add a work entry on the calendar.</p>
      ) : (
        <div className="space-y-3">
          {workEntries.map(([date, entry]) => (
            <div
              key={date}
              className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900"
            >
              <p className="font-semibold">{date}</p>
              <p className="text-xs mt-1">
                {entry.note && entry.note.trim().length > 0 ? entry.note : 'No description provided'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderManagerSection = () => (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Reporting Manager</h3>
        <p className="text-sm text-gray-500">Contact details for quick approvals or questions.</p>
      </div>
      {managerInfo ? (
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
            {managerInfo.photo ? (
              <img src={managerInfo.photo} alt={managerInfo.name} className="w-full h-full rounded-full object-cover" />
            ) : (
              (managerInfo.name || 'RM').slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="text-sm text-gray-700 space-y-1">
            <p className="text-base font-semibold text-gray-900">{managerInfo.name}</p>
            {managerInfo.department && <p className="text-gray-500">{managerInfo.department}</p>}
            {managerInfo.email && (
              <p>
                Email:{' '}
                <a href={`mailto:${managerInfo.email}`} className="text-indigo-600 font-medium hover:underline">
                  {managerInfo.email}
                </a>
              </p>
            )}
            {managerInfo.phone && (
              <p>
                Phone:{' '}
                <a href={`tel:${managerInfo.phone}`} className="text-indigo-600 font-medium hover:underline">
                  {managerInfo.phone}
                </a>
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
          Manager details not available yet. Once your reporting manager is assigned, their information will appear here automatically.
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">My Schedule</h2>
        <p className="text-sm text-gray-500">
          Track your leave and assigned work directly on the calendar.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row items-center gap-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 w-full px-4 py-2 rounded-xl border-2 transition-all font-semibold ${
              activeTab === tab.key
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow'
                : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-200 hover:bg-indigo-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'calendar' && (
        <div className="space-y-6">{renderCalendarSection()}</div>
      )}

      {activeTab === 'work' && renderWorkSection()}

      {activeTab === 'manager' && renderManagerSection()}
    </div>
  );
};

export default StaffSchedule;

