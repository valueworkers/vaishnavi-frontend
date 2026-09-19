import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiPlus, FiX, FiStar, FiMapPin, FiPhone, FiBriefcase, FiGlobe, FiEdit2, FiTrash2, FiHeart } from 'react-icons/fi';
import AlertModal from '../AlertModal';

const SERVICE_TYPE_OPTIONS = ['OPD', 'IN_HOUSE', 'CLIENT_SIDE'];

const ITEMS_PER_PAGE = 10; // Matches API page size

const parseServiceIsActive = (value) => {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return Boolean(value);
};

const serviceLocation = (sp) => {
  const place = String(sp?.place || '').trim();
  if (place) return place;
  const parts = [sp?.address, sp?.city].filter(Boolean).map((s) => String(s).trim());
  return parts.length ? parts.join(', ') : '—';
};

const serviceTags = (sp) => {
  if (Array.isArray(sp?.tags) && sp.tags.length > 0) return sp.tags;
  if (Array.isArray(sp?.services) && sp.services.length > 0) return sp.services;
  return [];
};

// Component for logo/icon display with error handling
const LogoDisplay = ({ logo, name, Icon, iconBg }) => {
  const [logoError, setLogoError] = useState(false);

  if (logo && !logoError) {
    return (
      <div className={`shrink-0 h-7 w-7 rounded-lg grid place-items-center ${iconBg} overflow-hidden`}>
        <img
          src={logo}
          alt={`${name} logo`}
          className="w-full h-full object-contain p-0.5"
          onError={() => setLogoError(true)}
        />
      </div>
    );
  }

  return (
    <div className={`shrink-0 h-7 w-7 rounded-lg grid place-items-center ${iconBg}`}>
      <Icon className="w-4 h-4" />
    </div>
  );
};

const ServiceDashboard = () => {
  const navigate = useNavigate();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [adminServices, setAdminServices] = useState([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [servicesError, setServicesError] = useState('');
  const [isLoadingServiceDetails, setIsLoadingServiceDetails] = useState(false);
  const [isAddingService, setIsAddingService] = useState(false);
  const [isUpdatingService, setIsUpdatingService] = useState(false);
  const [isDeletingService, setIsDeletingService] = useState(false);
  const [togglingActiveId, setTogglingActiveId] = useState(null);
  const [isLoadingAPI, setIsLoadingAPI] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    email: '',
    address: '',
    city: '',
    services: '',
    service_type: '',
    venue: [],
    is_active: true,
    photos: [],
    logo: null,
    website: '',
    description: '',
    quick_info: {
      starting_price_from: '',
      response_time: '',
      advance_booking: '',
      cancellation: ''
    }
  });

  const [locations, setLocations] = useState([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [servicesPagination, setServicesPagination] = useState({
    next: null,
    previous: null,
    count: 0,
    total_pages: 1,
    current_page: 1,
  });
  const [alertState, setAlertState] = useState({ open: false, type: 'info', message: '' });
  const showAlert = useCallback((message, type = 'info') => {
    setAlertState({ open: true, type, message: String(message) });
  }, []);
  const closeAlert = useCallback(() => setAlertState(prev => ({ ...prev, open: false })), []);

  // Use ref and AbortController to prevent double API calls (React StrictMode in development)
  const abortControllerRef = useRef(null);
  const isFetchingRef = useRef(false);

  // Load admin services from API
  useEffect(() => {
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Prevent double fetch - if already fetching, return
    if (isFetchingRef.current) {
      return;
    }
    isFetchingRef.current = true;

    // Create AbortController to cancel request if component unmounts or remounts
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Call loadServices with abort signal
    const loadServicesWithSignal = async () => {
      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) {
        setServicesError('Authorization token missing. Please log in again.');
        return;
      }

      if (signal.aborted) return;

      setIsLoadingServices(true);
      setIsLoadingAPI(true);
      setLoadingMessage('Loading services...');
      setServicesError('');

      try {
        const url = `${import.meta.env.VITE_BASEURL_CARE}/management/services/?page_size=${ITEMS_PER_PAGE}`;
        if (signal.aborted) return;
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: signal
        });
        if (signal.aborted) return;
        const data = response.data;
        const list = Array.isArray(data) ? data : (data?.results || data?.data || []);
        setAdminServices(list);
        setServicesPagination({
          next: data?.next || null,
          previous: data?.previous || null,
          count: data?.count ?? list.length,
          total_pages: data?.total_pages ?? 1,
          current_page: data?.current_page ?? 1,
        });
        isFetchingRef.current = false;
      } catch (error) {
        // Don't log or handle errors if request was aborted
        if (axios.isCancel(error) || signal.aborted) {
          return;
        }
        const errorMessage = error.response?.data?.message || 
                            error.response?.data?.detail || 
                            error.message || 
                            'Failed to fetch services.';
        setServicesError(errorMessage);
        setAdminServices([]);
        isFetchingRef.current = false;
      } finally {
        if (!signal.aborted) {
          setIsLoadingServices(false);
          setIsLoadingAPI(false);
          setLoadingMessage('');
        }
      }
    };

    loadServicesWithSignal();

    // Cleanup function
    return () => {
      isFetchingRef.current = false;
      // Abort any pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const loadServices = async (pageUrl = null) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setServicesError('Authorization token missing. Please log in again.');
      return;
    }

    setIsLoadingServices(true);
    setIsLoadingAPI(true);
    setLoadingMessage(pageUrl ? 'Loading page...' : 'Loading services...');
    setServicesError('');

    const url = pageUrl || `${import.meta.env.VITE_BASEURL_CARE}/management/services/?page_size=${ITEMS_PER_PAGE}`;
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = response.data;
      const list = Array.isArray(data) ? data : (data?.results || data?.data || []);
      setAdminServices(list);
      setServicesPagination({
        next: data?.next || null,
        previous: data?.previous || null,
        count: data?.count ?? list.length,
        total_pages: data?.total_pages ?? 1,
        current_page: data?.current_page ?? 1,
      });
    } catch (error) {
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.detail || 
                          error.message || 
                          'Failed to fetch services.';
      setServicesError(errorMessage);
      setAdminServices([]);
    } finally {
      setIsLoadingServices(false);
      setIsLoadingAPI(false);
      setLoadingMessage('');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      contact: '',
      email: '',
      address: '',
      city: '',
      services: '',
      service_type: '',
      venue: [],
      is_active: true,
      photos: [],
      logo: null,
      website: '',
      description: '',
      quick_info: {
        starting_price_from: '',
        response_time: '',
        advance_booking: '',
        cancellation: ''
      }
    });
  };

  // Load locations (venues) from booking API for dropdown
  useEffect(() => {
    const loadLocations = async () => {
      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) return;
      setIsLoadingLocations(true);
      try {
        const allResults = [];
        let url = `${import.meta.env.VITE_BASEURL_CARE}/management/venues/`;
        while (url) {
          const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const data = response.data;
          const list = data.results || [];
          allResults.push(...list);
          url = data.next || null;
        }
        setLocations(allResults);
      } catch (err) {
        console.error('Failed to fetch locations:', err);
        setLocations([]);
      } finally {
        setIsLoadingLocations(false);
      }
    };
    loadLocations();
  }, []);

  // Handle photo file change with preview - supports multiple files
  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setFormData({...formData, photos: [...formData.photos, ...files]});
    }
  };

  // Remove a photo from the photos array
  const handleRemovePhoto = (index) => {
    const newPhotos = formData.photos.filter((_, i) => i !== index);
    setFormData({...formData, photos: newPhotos});
  };

  // Handle logo file change with preview
  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData({...formData, logo: file});
    } else {
      setFormData({...formData, logo: null});
    }
  };

  // Get preview URLs for photos (either File objects or string URLs)
  const getPhotoPreviews = useMemo(() => {
    return formData.photos.map(photo => {
      if (photo instanceof File) {
        return URL.createObjectURL(photo);
      }
      if (typeof photo === 'string') {
        return photo;
      }
      return null;
    }).filter(Boolean);
  }, [formData.photos]);

  // Get preview URL for logo (either File object or string URL)
  const getLogoPreview = useMemo(() => {
    if (!formData.logo) return null;
    if (formData.logo instanceof File) {
      return URL.createObjectURL(formData.logo);
    }
    if (typeof formData.logo === 'string') {
      return formData.logo;
    }
    return null;
  }, [formData.logo]);

  // Cleanup object URLs when they change
  useEffect(() => {
    return () => {
      // Revoke URLs created for File objects in getPhotoPreviews
      formData.photos.forEach(photo => {
        if (photo instanceof File) {
          // Note: URLs are created in getPhotoPreviews useMemo, but we need to revoke them
          // Since useMemo creates new URLs on each change, we revoke old ones here
        }
      });
      if (getLogoPreview && formData.logo instanceof File) {
        URL.revokeObjectURL(getLogoPreview);
      }
    };
  }, [formData.photos, getLogoPreview, formData.logo]);

  const handleAddService = async () => {
    const missingFields = [];
    if (!formData.name || !formData.name.trim()) missingFields.push('Service Name');
    if (!formData.contact || !formData.contact.trim()) missingFields.push('Contact Number');
    if (!formData.address || !formData.address.trim()) missingFields.push('Address');
    if (!formData.city || !formData.city.trim()) missingFields.push('City');
    if (!formData.services || !formData.services.trim()) missingFields.push('Services/Tags');

    if (missingFields.length > 0) {
      showAlert(`Please fill in the following required fields:\n\n${missingFields.join('\n')}`, 'warning');
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setIsAddingService(true);
    setIsLoadingAPI(true);
    setLoadingMessage('Adding service...');

    try {
      // Create FormData object
      const formDataToSend = new FormData();
      
      // Add text fields
      formDataToSend.append('name', formData.name);
      formDataToSend.append('contact', formData.contact);
      if (formData.email) {
        formDataToSend.append('email', formData.email);
      }
      formDataToSend.append('address', formData.address);
      formDataToSend.append('city', formData.city);
      // Convert services string to tags array and send as JSON
      const tagsArray = formData.services.split(',').map(s => s.trim()).filter(s => s);
      formDataToSend.append('tags', JSON.stringify(tagsArray));
      if (formData.service_type) {
        formDataToSend.append('service_type', formData.service_type);
      }
      if (formData.website) {
        formDataToSend.append('website', formData.website);
      }
      if (formData.description) {
        formDataToSend.append('description', formData.description);
      }
      if (formData.service_type !== 'CLIENT_SIDE' && formData.venue && formData.venue.length > 0) {
        formData.venue.forEach((id) => formDataToSend.append('venue', Number(id)));
      }

      // Add file fields (photos and logo)
      if (formData.photos && formData.photos.length > 0) {
        formData.photos.forEach((photo) => {
          if (photo instanceof File) {
            formDataToSend.append('photos', photo);
          }
        });
      }
      if (formData.logo && formData.logo instanceof File) {
        formDataToSend.append('logo', formData.logo);
      }

      // Add quick_info as JSON string or individual fields
      if (formData.quick_info) {
        if (formData.quick_info.starting_price_from) {
          formDataToSend.append('starting_price_from', formData.quick_info.starting_price_from);
        }
        if (formData.quick_info.response_time) {
          formDataToSend.append('response_time', formData.quick_info.response_time);
        }
        if (formData.quick_info.advance_booking) {
          formDataToSend.append('advance_booking', formData.quick_info.advance_booking);
        }
        if (formData.quick_info.cancellation) {
          formDataToSend.append('cancellation', formData.quick_info.cancellation);
        }
      }

      // Make API POST request
      const response = await axios.post(
        `${import.meta.env.VITE_BASEURL_CARE}/management/services/`,
        formDataToSend,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // Handle successful response
      if (response.data) {
        showAlert('Service added successfully!', 'success');
        resetForm();
        setShowAddModal(false);
        await loadServices(); // Reload to update the list
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.detail || 
                          error.message || 
                          'Failed to add service. Please try again.';
      showAlert(errorMessage, 'error');
    } finally {
      setIsAddingService(false);
      setIsLoadingAPI(false);
      setLoadingMessage('');
    }
  };

  const handleEditService = async (service) => {
    if (!service || !service.id) {
      showAlert('Service ID is missing. Cannot edit.', 'warning');
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setIsLoadingServiceDetails(true);
    setIsLoadingAPI(true);
    setLoadingMessage('Loading service details...');
    setShowEditModal(true);
    setEditingService(service); // Set temporarily for loading state

    try {
      // Fetch the specific service details from API
      const response = await axios.get(
        `${import.meta.env.VITE_BASEURL_CARE}/management/services/${service.id}/`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const serviceData = response.data;

      // Parse place into address and city if needed
      let address = serviceData.address || '';
      let city = serviceData.city || '';
      if (!address && !city && serviceData.place) {
        const parts = serviceData.place.split(',').map(s => s.trim());
        if (parts.length >= 2) {
          address = parts.slice(0, -1).join(', ');
          city = parts[parts.length - 1];
        } else {
          address = serviceData.place;
        }
      }
      
      // Get all photos from photos array - photos is array of objects with image field
      const photosArray = (serviceData.photos && Array.isArray(serviceData.photos) && serviceData.photos.length > 0)
        ? serviceData.photos.map(p => p.image || p).filter(Boolean)
        : [];

      // Get tags or services
      const tagsOrServices = Array.isArray(serviceData.tags) && serviceData.tags.length > 0
        ? serviceData.tags
        : (Array.isArray(serviceData.services) ? serviceData.services : []);

      setFormData({
        name: serviceData.name || '',
        contact: serviceData.contact || '',
        email: serviceData.email || '',
        address: address,
        city: city,
        services: tagsOrServices.join(', '),
        service_type: serviceData.service_type || '',
        venue: Array.isArray(serviceData.venue) ? serviceData.venue.map(Number) : (serviceData.venue != null ? [Number(serviceData.venue)] : (serviceData.location != null ? [Number(serviceData.location)] : [])),
        is_active: serviceData.is_active !== undefined ? Boolean(serviceData.is_active) : true,
        photos: photosArray,
        logo: serviceData.logo || null,
        website: serviceData.website || '',
        description: serviceData.description || '',
        quick_info: serviceData.quick_info && typeof serviceData.quick_info === 'object' ? {
          starting_price_from: serviceData.quick_info.starting_price_from || '',
          response_time: serviceData.quick_info.response_time || '',
          advance_booking: serviceData.quick_info.advance_booking || '',
          cancellation: serviceData.quick_info.cancellation || ''
        } : {
          starting_price_from: serviceData.starting_price_from || '',
          response_time: serviceData.response_time || '',
          advance_booking: serviceData.advance_booking || '',
          cancellation: serviceData.cancellation || ''
        }
      });

      setEditingService(serviceData); // Set the fetched service data
    } catch (error) {
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.detail || 
                          error.message || 
                          'Failed to fetch service details.';
      showAlert(errorMessage, 'error');
      setShowEditModal(false);
      setEditingService(null);
    } finally {
      setIsLoadingServiceDetails(false);
      setIsLoadingAPI(false);
      setLoadingMessage('');
    }
  };

  const handleUpdateService = async () => {
    const missingFields = [];
    if (!formData.name || !formData.name.trim()) missingFields.push('Service Name');
    if (!formData.contact || !formData.contact.trim()) missingFields.push('Contact Number');
    if (!formData.address || !formData.address.trim()) missingFields.push('Address');
    if (!formData.city || !formData.city.trim()) missingFields.push('City');
    if (!formData.services || !formData.services.trim()) missingFields.push('Services/Tags');

    if (missingFields.length > 0) {
      showAlert(`Please fill in the following required fields:\n\n${missingFields.join('\n')}`, 'warning');
      return;
    }

    if (!editingService || !editingService.id) {
      showAlert('Service ID is missing. Cannot update.', 'warning');
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setIsUpdatingService(true);
    setIsLoadingAPI(true);
    setLoadingMessage('Updating service...');

    try {
      // Create FormData object
      const formDataToSend = new FormData();
      
      // Add text fields
      formDataToSend.append('name', formData.name);
      formDataToSend.append('contact', formData.contact);
      if (formData.email) {
        formDataToSend.append('email', formData.email);
      }
      formDataToSend.append('address', formData.address);
      formDataToSend.append('city', formData.city);
      // Convert services string to tags array and send as JSON
      const tagsArray = formData.services.split(',').map(s => s.trim()).filter(s => s);
      formDataToSend.append('tags', JSON.stringify(tagsArray));
      if (formData.service_type) {
        formDataToSend.append('service_type', formData.service_type);
      }
      if (formData.website) {
        formDataToSend.append('website', formData.website);
      }
      if (formData.description) {
        formDataToSend.append('description', formData.description);
      }
      if (formData.service_type !== 'CLIENT_SIDE' && formData.venue && formData.venue.length > 0) {
        formData.venue.forEach((id) => formDataToSend.append('venue', Number(id)));
      }
      formDataToSend.append('is_active', formData.is_active);

      // Add file fields (photos and logo) - only if new files are selected
      if (formData.photos && formData.photos.length > 0) {
        formData.photos.forEach((photo) => {
          if (photo instanceof File) {
            formDataToSend.append('photos', photo); // Use 'photos' (plural) for API
          }
        });
      }
      if (formData.logo && formData.logo instanceof File) {
        formDataToSend.append('logo', formData.logo);
      }

      // Add quick_info fields
      if (formData.quick_info) {
        if (formData.quick_info.starting_price_from) {
          formDataToSend.append('starting_price_from', formData.quick_info.starting_price_from);
        }
        if (formData.quick_info.response_time) {
          formDataToSend.append('response_time', formData.quick_info.response_time);
        }
        if (formData.quick_info.advance_booking) {
          formDataToSend.append('advance_booking', formData.quick_info.advance_booking);
        }
        if (formData.quick_info.cancellation) {
          formDataToSend.append('cancellation', formData.quick_info.cancellation);
        }
      }

      // Make API PUT request
      const response = await axios.put(
        `${import.meta.env.VITE_BASEURL_CARE}/management/services/${editingService.id}/`,
        formDataToSend,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // Handle successful response
      if (response.data) {
        showAlert('Service updated successfully!', 'success');
        resetForm();
        setShowEditModal(false);
        setEditingService(null);
        await loadServices(); // Reload to update the list
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.detail || 
                          error.message || 
                          'Failed to update service. Please try again.';
      showAlert(errorMessage, 'error');
    } finally {
      setIsUpdatingService(false);
      setIsLoadingAPI(false);
      setLoadingMessage('');
    }
  };

  const handleToggleServiceActive = async (sp) => {
    const serviceId = sp?.id;
    if (!serviceId || togglingActiveId != null) return;

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    const wasActive = parseServiceIsActive(sp.is_active);
    const nextActive = !wasActive;

    setTogglingActiveId(serviceId);
    setAdminServices((prev) =>
      prev.map((s) => (s.id === serviceId ? { ...s, is_active: nextActive } : s))
    );

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('is_active', nextActive ? 'true' : 'false');

      await axios.patch(
        `${import.meta.env.VITE_BASEURL_CARE}/management/services/${serviceId}/`,
        formDataToSend,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
    } catch (error) {
      setAdminServices((prev) =>
        prev.map((s) => (s.id === serviceId ? { ...s, is_active: wasActive } : s))
      );
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.detail ||
        error.message ||
        'Failed to update service status.';
      showAlert(errorMessage, 'error');
    } finally {
      setTogglingActiveId(null);
    }
  };

  const handleDeleteService = async (serviceId) => {
    if (!window.confirm('Are you sure you want to delete this service?')) {
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setIsDeletingService(true);
    setIsLoadingAPI(true);
    setLoadingMessage('Deleting service...');

    try {
      await axios.delete(
        `${import.meta.env.VITE_BASEURL_CARE}/management/services/${serviceId}/`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      showAlert('Service deleted successfully!', 'success');
      await loadServices(); // Reload to update the list
    } catch (error) {
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.detail || 
                          error.message || 
                          'Failed to delete service. Please try again.';
      showAlert(errorMessage, 'error');
    } finally {
      setIsDeletingService(false);
      setIsLoadingAPI(false);
      setLoadingMessage('');
    }
  };

  // Server-side pagination: adminServices is the current page only

  return (
    <>
    <div className="py-3 px-1 relative">
      {/* Global Loading Overlay */}
      {isLoadingAPI && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg p-6 shadow-xl flex flex-col items-center gap-4 min-w-[200px]">
            <div className="relative">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            </div>
            <p className="text-gray-700 font-medium">{loadingMessage || 'Loading...'}</p>
          </div>
        </div>
      )}
      
      <div className="max-w-7xl mx-auto">
        {/* Add Service Button - Similar to VenuesDashboard */}
        <div className="mb-3 flex justify-end gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow flex items-center gap-2"
          >
            <FiPlus className="w-4 h-4" />
            Add Service
          </button>
        </div>

        {/* Services List - Always Shown */}
        <div className="flex flex-col gap-2">
          {isLoadingServices ? (
            <div className="bg-white rounded-lg p-8 text-center text-gray-600">Loading services...</div>
          ) : servicesError ? (
            <div className="bg-white rounded-lg p-8 text-center text-red-600">{servicesError}</div>
          ) : adminServices.length > 0 ? (
              <div className="bg-white rounded-lg shadow-sm ring-1 ring-gray-200 overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-700 uppercase tracking-wide">
                      <th className="px-3 py-2.5 min-w-[120px]">Name</th>
                      <th className="px-3 py-2.5 min-w-[140px]">Location</th>
                      <th className="px-3 py-2.5 min-w-[100px]">Contact</th>
                      <th className="px-3 py-2.5 w-20">Website</th>
                      <th className="px-3 py-2.5 min-w-[140px]">Tags</th>
                      <th className="px-3 py-2.5 w-20 text-center">Active</th>
                      <th className="px-3 py-2.5 w-20 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {adminServices.map((sp) => {
                      const tags = serviceTags(sp);
                      const isActive = parseServiceIsActive(sp.is_active);
                      const isToggling = togglingActiveId === sp.id;
                      return (
                        <tr key={sp.id} className="hover:bg-gray-50/80 transition-colors">
                          <td className="px-3 py-2 align-middle">
                            <span className="font-semibold text-gray-900 line-clamp-2">{sp.name}</span>
                          </td>
                          <td className="px-3 py-2 align-middle text-gray-700">
                            <div className="flex items-start gap-1 max-w-[200px]">
                              <FiMapPin className="text-gray-500 w-3 h-3 shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{serviceLocation(sp)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-middle text-gray-700">
                            <div className="flex items-center gap-1">
                              <FiPhone className="text-gray-500 w-3 h-3 shrink-0" />
                              <span>{sp.contact || 'N/A'}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-middle">
                            {sp.website && String(sp.website).trim() !== '' ? (
                              <a
                                href={sp.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-800 font-medium"
                                title={sp.website}
                              >
                                <FiGlobe className="w-3 h-3 shrink-0" />
                                Link
                              </a>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <div className="flex items-start gap-1">
                              <FiBriefcase className="text-gray-500 w-3 h-3 shrink-0 mt-0.5" />
                              <div className="flex flex-wrap gap-0.5">
                                {tags.length > 0 ? (
                                  tags.slice(0, 3).map((s, idx) => (
                                    <span
                                      key={idx}
                                      className="px-1 py-0.5 rounded-full text-[9px] ring-1 bg-gray-50 text-gray-700 ring-gray-200"
                                    >
                                      {s}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-gray-400 italic text-[10px]">No tags</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-middle text-center">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isActive}
                              aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${sp.name}`}
                              disabled={isToggling || isDeletingService}
                              onClick={() => handleToggleServiceActive(sp)}
                              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                isActive ? 'bg-green-500' : 'bg-gray-300'
                              }`}
                            >
                              <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                  isActive ? 'translate-x-5' : 'translate-x-0.5'
                                }`}
                              />
                            </button>
                          </td>
                          <td className="px-3 py-2 align-middle text-right">
                            <div className="inline-flex gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => handleEditService(sp)}
                                className="p-1 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Edit Service"
                              >
                                <FiEdit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteService(sp.id)}
                                disabled={isDeletingService}
                                className={`p-1 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors ${isDeletingService ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title={isDeletingService ? 'Deleting...' : 'Delete Service'}
                              >
                                <FiTrash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white rounded-lg p-8 text-center text-gray-600">No services found.</div>
            )}
        </div>
        {adminServices.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
            <div className="text-sm text-gray-600">
              Showing{' '}
              <span className="font-semibold">
                {(servicesPagination.current_page - 1) * ITEMS_PER_PAGE + 1}-
                {(servicesPagination.current_page - 1) * ITEMS_PER_PAGE + adminServices.length}
              </span>{' '}
              of <span className="font-semibold">{servicesPagination.count}</span> services
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => loadServices(servicesPagination.previous)}
                disabled={!servicesPagination.previous}
                className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                  !servicesPagination.previous
                    ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Previous
              </button>
              <span className="text-sm font-semibold text-gray-700">
                Page {servicesPagination.current_page} of {servicesPagination.total_pages}
              </span>
              <button
                onClick={() => loadServices(servicesPagination.next)}
                disabled={!servicesPagination.next}
                className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                  !servicesPagination.next
                    ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Edit Service Modal */}
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-4">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowEditModal(false); resetForm(); setEditingService(null); setIsLoadingServiceDetails(false); }} />
            <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl">
              <div className="flex justify-between items-center p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Edit Service</h2>
                <button
                  onClick={() => { setShowEditModal(false); resetForm(); setEditingService(null); setIsLoadingServiceDetails(false); }}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                >
                  <FiX className="h-6 w-6" />
                </button>
              </div>
              
              {isLoadingServiceDetails ? (
                <div className="p-12 text-center">
                  <div className="text-gray-600 text-lg">Loading service details...</div>
                </div>
              ) : (
                <>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Service Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter service name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number *</label>
                    <input
                      type="tel"
                      value={formData.contact}
                      onChange={(e) => setFormData({...formData, contact: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="+91 98765 43210"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="example@email.com"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Street address"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({...formData, city: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="City, State"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
                    <select
                      value={formData.service_type}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        setFormData({
                          ...formData,
                          service_type: nextType,
                          venue: nextType === 'CLIENT_SIDE' ? [] : formData.venue,
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select Service Type</option>
                      {SERVICE_TYPE_OPTIONS.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  {formData.service_type !== 'CLIENT_SIDE' && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Venues (optional, select multiple)</label>
                    {isLoadingLocations ? (
                      <p className="text-sm text-gray-500 py-2">Loading venues...</p>
                    ) : (
                      <div className="border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto bg-gray-50">
                        {locations.length === 0 ? (
                          <p className="text-sm text-gray-500">No venues available</p>
                        ) : (
                          <div className="space-y-2">
                            {locations.map((loc) => {
                              const venueId = Number(loc.id);
                              const checked = formData.venue.includes(venueId);
                              return (
                                <label
                                  key={loc.id}
                                  className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer hover:bg-gray-100 ${checked ? 'bg-blue-50' : ''}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const next = checked
                                        ? formData.venue.filter((id) => id !== venueId)
                                        : [...formData.venue, venueId];
                                      setFormData({ ...formData, venue: next });
                                    }}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-sm text-gray-800">
                                    {loc.name || loc.location?.locality || 'Venue'}{loc.location?.locality ? ` (${loc.location.locality})` : ''}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    {formData.venue.length > 0 && (
                      <p className="text-xs text-gray-600 mt-1">{formData.venue.length} venue(s) selected</p>
                    )}
                  </div>
                  )}
                  
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Photos (Multiple)</label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">You can select multiple photos at once. Existing photos will be shown below.</p>
                    {formData.photos.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {formData.photos.map((photo, index) => {
                          const previewUrl = photo instanceof File 
                            ? URL.createObjectURL(photo) 
                            : photo;
                          return (
                            <div key={index} className="relative group">
                              <img
                                src={previewUrl}
                                alt={`Photo ${index + 1}`}
                                className="w-full h-32 object-cover rounded-lg border border-gray-300"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => handleRemovePhoto(index)}
                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Remove photo"
                              >
                                <FiX className="w-3 h-3" />
                              </button>
                              {photo instanceof File && (
                                <p className="text-xs text-gray-500 mt-1 truncate" title={photo.name}>
                                  {photo.name}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {getLogoPreview && (
                      <div className="mt-2">
                        <img
                          src={getLogoPreview}
                          alt="Logo preview"
                          className="w-32 h-32 object-contain rounded-lg border border-gray-300 bg-gray-50"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                        {formData.logo instanceof File && (
                          <p className="text-xs text-gray-500 mt-1">Selected: {formData.logo.name}</p>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label>
                    <input
                      type="url"
                      value={formData.website}
                      onChange={(e) => setFormData({...formData, website: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="https://example.com"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    rows="4"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter service description"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Services/Tags *</label>
                  <input
                    type="text"
                    value={formData.services}
                    onChange={(e) => setFormData({...formData, services: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Home Care, Nursing Care, Physiotherapy, Medical Equipment (comma separated)"
                  />
                  <p className="text-xs text-gray-500 mt-1">Separate multiple services with commas</p>
                </div>

                {editingService && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Active</label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Service is active</span>
                    </label>
                  </div>
                )}
                
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Quick Info</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Starting Price From</label>
                      <input
                        type="text"
                        value={formData.quick_info.starting_price_from}
                        onChange={(e) => setFormData({
                          ...formData,
                          quick_info: { ...formData.quick_info, starting_price_from: e.target.value }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., ₹5000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Response Time</label>
                      <input
                        type="text"
                        value={formData.quick_info.response_time}
                        onChange={(e) => setFormData({
                          ...formData,
                          quick_info: { ...formData.quick_info, response_time: e.target.value }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., 24 hours"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Advance Booking</label>
                      <input
                        type="text"
                        value={formData.quick_info.advance_booking}
                        onChange={(e) => setFormData({
                          ...formData,
                          quick_info: { ...formData.quick_info, advance_booking: e.target.value }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., 7 days"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Cancellation</label>
                      <input
                        type="text"
                        value={formData.quick_info.cancellation}
                        onChange={(e) => setFormData({
                          ...formData,
                          quick_info: { ...formData.quick_info, cancellation: e.target.value }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., Free cancellation"
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
                <button
                  onClick={() => { setShowEditModal(false); resetForm(); setEditingService(null); setIsLoadingServiceDetails(false); }}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateService}
                  disabled={isLoadingServiceDetails || isUpdatingService}
                  className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 ${isLoadingServiceDetails || isUpdatingService ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isUpdatingService ? 'Updating...' : 'Update Service'}
                </button>
              </div>
              </>
              )}
            </div>
          </div>
        )}

        {/* Add Service Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-4">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowAddModal(false); resetForm(); }} />
            <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl">
              <div className="flex justify-between items-center p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Add New Service</h2>
                <button
                  onClick={() => { setShowAddModal(false); resetForm(); }}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                >
                  <FiX className="h-6 w-6" />
                </button>
              </div>
              
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Service Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter service name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number *</label>
                    <input
                      type="tel"
                      value={formData.contact}
                      onChange={(e) => setFormData({...formData, contact: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="+91 98765 43210"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="example@email.com"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Street address"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({...formData, city: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="City, State"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
                    <select
                      value={formData.service_type}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        setFormData({
                          ...formData,
                          service_type: nextType,
                          venue: nextType === 'CLIENT_SIDE' ? [] : formData.venue,
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select Service Type</option>
                      {SERVICE_TYPE_OPTIONS.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  {formData.service_type !== 'CLIENT_SIDE' && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Venues (optional, select multiple)</label>
                    {isLoadingLocations ? (
                      <p className="text-sm text-gray-500 py-2">Loading venues...</p>
                    ) : (
                      <div className="border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto bg-gray-50">
                        {locations.length === 0 ? (
                          <p className="text-sm text-gray-500">No venues available</p>
                        ) : (
                          <div className="space-y-2">
                            {locations.map((loc) => {
                              const venueId = Number(loc.id);
                              const checked = formData.venue.includes(venueId);
                              return (
                                <label
                                  key={loc.id}
                                  className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer hover:bg-gray-100 ${checked ? 'bg-blue-50' : ''}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const next = checked
                                        ? formData.venue.filter((id) => id !== venueId)
                                        : [...formData.venue, venueId];
                                      setFormData({ ...formData, venue: next });
                                    }}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-sm text-gray-800">
                                    {loc.name || loc.location?.locality || 'Venue'}{loc.location?.locality ? ` (${loc.location.locality})` : ''}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    {formData.venue.length > 0 && (
                      <p className="text-xs text-gray-600 mt-1">{formData.venue.length} venue(s) selected</p>
                    )}
                  </div>
                  )}
                  
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Photos (Multiple)</label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">You can select multiple photos at once</p>
                    {formData.photos.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {formData.photos.map((photo, index) => {
                          const previewUrl = photo instanceof File 
                            ? URL.createObjectURL(photo) 
                            : photo;
                          return (
                            <div key={index} className="relative group">
                              <img
                                src={previewUrl}
                                alt={`Photo ${index + 1}`}
                                className="w-full h-32 object-cover rounded-lg border border-gray-300"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => handleRemovePhoto(index)}
                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Remove photo"
                              >
                                <FiX className="w-3 h-3" />
                              </button>
                              {photo instanceof File && (
                                <p className="text-xs text-gray-500 mt-1 truncate" title={photo.name}>
                                  {photo.name}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {getLogoPreview && (
                      <div className="mt-2">
                        <img
                          src={getLogoPreview}
                          alt="Logo preview"
                          className="w-32 h-32 object-contain rounded-lg border border-gray-300 bg-gray-50"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                        {formData.logo instanceof File && (
                          <p className="text-xs text-gray-500 mt-1">Selected: {formData.logo.name}</p>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label>
                    <input
                      type="url"
                      value={formData.website}
                      onChange={(e) => setFormData({...formData, website: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="https://example.com"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    rows="4"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter service description"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Services/Tags *</label>
                  <input
                    type="text"
                    value={formData.services}
                    onChange={(e) => setFormData({...formData, services: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Home Care, Nursing Care, Physiotherapy, Medical Equipment (comma separated)"
                  />
                  <p className="text-xs text-gray-500 mt-1">Separate multiple services with commas</p>
                </div>

                {editingService && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Active</label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Service is active</span>
                    </label>
                  </div>
                )}
                
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Quick Info</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Starting Price From</label>
                      <input
                        type="text"
                        value={formData.quick_info.starting_price_from}
                        onChange={(e) => setFormData({
                          ...formData,
                          quick_info: { ...formData.quick_info, starting_price_from: e.target.value }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., ₹5000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Response Time</label>
                      <input
                        type="text"
                        value={formData.quick_info.response_time}
                        onChange={(e) => setFormData({
                          ...formData,
                          quick_info: { ...formData.quick_info, response_time: e.target.value }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., 24 hours"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Advance Booking</label>
                      <input
                        type="text"
                        value={formData.quick_info.advance_booking}
                        onChange={(e) => setFormData({
                          ...formData,
                          quick_info: { ...formData.quick_info, advance_booking: e.target.value }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., 7 days"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Cancellation</label>
                      <input
                        type="text"
                        value={formData.quick_info.cancellation}
                        onChange={(e) => setFormData({
                          ...formData,
                          quick_info: { ...formData.quick_info, cancellation: e.target.value }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., Free cancellation"
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
                <button
                  onClick={() => { setShowAddModal(false); resetForm(); }}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddService}
                  disabled={isAddingService}
                  className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 ${isAddingService ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isAddingService ? 'Adding...' : 'Add Service'}
                </button>
              </div>
            </div>
        </div>
        )}
    </div>
  </div>
  <AlertModal open={alertState.open} type={alertState.type} message={alertState.message} onClose={closeAlert} />
  </>
);
};

export default ServiceDashboard;
