import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { FiMapPin, FiPackage, FiPlus, FiEdit2, FiTrash2, FiGrid } from 'react-icons/fi';
import { hasOwnerPrivileges } from '../../utils/authRoles';

const baseUrl = () => `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────
const LocationPackage = () => {
  const [authUser, setAuthUser] = useState(null);
  const [locationsList, setLocationsList] = useState([]); // from API GET
  const [localData, setLocalData] = useState({}); // { [locationId]: { label, services } }
  const [location, setLocation] = useState('');
  const [service, setService] = useState('');
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [packageType, setPackageType] = useState('service'); // 'service' | 'venue' | 'client'
  const [serviceType, setServiceType] = useState('IN_HOUSE'); // IN_HOUSE | OPD | CLIENT_SIDE
  const [serviceTypeServices, setServiceTypeServices] = useState([]);
  const [servicePackages, setServicePackages] = useState([]);
  const [venuesList, setVenuesList] = useState([]); // Venues from venue_dropdown API
  const [selectedVenue, setSelectedVenue] = useState(''); // Selected venue ID for venue packages
  const [venuePackages, setVenuePackages] = useState([]); // Packages for selected venue
  const [clientServicesList, setClientServicesList] = useState([]); // CLIENT_SIDE services from service_dropdown
  const [selectedClientService, setSelectedClientService] = useState('');
  const [clientPackages, setClientPackages] = useState([]);

  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [isLoadingVenues, setIsLoadingVenues] = useState(false);
  const [isLoadingClientServices, setIsLoadingClientServices] = useState(false);
  const [isLoadingServiceTypeServices, setIsLoadingServiceTypeServices] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [serviceError, setServiceError] = useState('');
  const [packagesError, setPackagesError] = useState('');
  const [venuesError, setVenuesError] = useState('');
  const [clientServicesError, setClientServicesError] = useState('');
  const [serviceTypeServicesError, setServiceTypeServicesError] = useState('');
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [isDeletingLocation, setIsDeletingLocation] = useState(false);
  const [deletingPackageId, setDeletingPackageId] = useState(null);
  const [isSavingPackage, setIsSavingPackage] = useState(false);

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

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
      } catch (err) {
        console.error('Error parsing authUser from localStorage:', err);
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

  // GET locations from API
  const loadLocations = useCallback(async () => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setLocationError('Authorization token missing. Please log in again.');
      return;
    }
    setIsLoadingLocations(true);
    setLocationError('');
    try {
      const response = await axios.get(`${baseUrl()}/booking/location/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const results = response.data?.results ?? (Array.isArray(response.data) ? response.data : []);
      setLocationsList(results);
      setLocalData((prev) => {
        const next = { ...prev };
        results.forEach((loc) => {
          const id = String(loc.id ?? loc.pk ?? loc.name);
          const label = loc.locality ?? loc.name ?? loc.label ?? id;
          next[id] = next[id] ? { ...next[id], label } : { label, services: {} };
        });
        return next;
      });
    } catch (err) {
      console.error('Error fetching locations:', err);
      const msg = err.response?.data?.message ?? err.response?.data?.detail ?? err.message ?? 'Failed to fetch locations';
      setLocationError(msg);
      setLocationsList([]);
    } finally {
      setIsLoadingLocations(false);
    }
  }, []);

  useEffect(() => {
    if (isVsreOwner) loadLocations();
  }, [isVsreOwner, loadLocations]);

  // Load venues dropdown when packageType is 'venue'
  const loadVenuesDropdown = useCallback(async () => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setVenuesError('Authorization token missing. Please log in again.');
      return;
    }
    setIsLoadingVenues(true);
    setVenuesError('');
    try {
      const response = await axios.get(`${baseUrl()}/booking/public-venues/venue_dropdown`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const venuesData = Array.isArray(response.data) ? response.data : (response.data?.results ?? []);
      setVenuesList(venuesData);
    } catch (err) {
      console.error('Error fetching venues:', err);
      const msg = err.response?.data?.message ?? err.response?.data?.detail ?? err.message ?? 'Failed to fetch venues';
      setVenuesError(msg);
      setVenuesList([]);
    } finally {
      setIsLoadingVenues(false);
    }
  }, []);

  useEffect(() => {
    if (packageType === 'venue' && isVsreOwner) {
      loadVenuesDropdown();
    }
  }, [packageType, isVsreOwner, loadVenuesDropdown]);

  // Service Packages flow: load services by selected service_type
  const loadServicesByType = useCallback(async (type) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setServiceTypeServicesError('Authorization token missing. Please log in again.');
      return;
    }
    setIsLoadingServiceTypeServices(true);
    setServiceTypeServicesError('');
    try {
      const response = await axios.get(`${baseUrl()}/management/services/service_dropdown/`, {
        params: { service_type: type },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = Array.isArray(response.data) ? response.data : (response.data?.results ?? []);
      setServiceTypeServices(data);
    } catch (err) {
      console.error('Error fetching services by type:', err);
      const msg = err.response?.data?.message ?? err.response?.data?.detail ?? err.message ?? 'Failed to fetch services';
      setServiceTypeServicesError(msg);
      setServiceTypeServices([]);
    } finally {
      setIsLoadingServiceTypeServices(false);
    }
  }, []);

  useEffect(() => {
    if (packageType === 'service' && isVsreOwner) {
      loadServicesByType(serviceType);
      setService('');
      setSelectedPkg(null);
      setServicePackages([]);
      setPackagesError('');
    }
  }, [packageType, serviceType, isVsreOwner, loadServicesByType]);

  const loadClientServicesDropdown = useCallback(async () => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setClientServicesError('Authorization token missing. Please log in again.');
      return;
    }
    setIsLoadingClientServices(true);
    setClientServicesError('');
    try {
      const response = await axios.get(`${baseUrl()}/management/services/service_dropdown/`, {
        params: { service_type: 'CLIENT_SIDE' },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = Array.isArray(response.data) ? response.data : (response.data?.results ?? []);
      setClientServicesList(data);
    } catch (err) {
      console.error('Error fetching client-side services:', err);
      const msg = err.response?.data?.message ?? err.response?.data?.detail ?? err.message ?? 'Failed to fetch client services';
      setClientServicesError(msg);
      setClientServicesList([]);
    } finally {
      setIsLoadingClientServices(false);
    }
  }, []);

  useEffect(() => {
    if (packageType === 'client' && isVsreOwner) {
      loadClientServicesDropdown();
    }
  }, [packageType, isVsreOwner, loadClientServicesDropdown]);

  // Load services for a specific location from API
  const loadServicesForLocation = useCallback(async (locationId) => {
    if (!locationId) return;
    
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setServiceError('Authorization token missing. Please log in again.');
      return;
    }
    
    setIsLoadingServices(true);
    setServiceError('');
    
    try {
      const response = await axios.get(`${baseUrl()}/management/services/?venue__location=${locationId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      // Handle API response - paginated format with results array
      const servicesData = response.data?.results ?? (Array.isArray(response.data) ? response.data : []);
      
      // Map API services to local data structure
      const servicesMap = {};
      servicesData.forEach((svc) => {
        // Use service id as key
        const serviceKey = String(svc.id);
        const serviceLabel = svc.name || `Service ${svc.id}`;
        
        // Determine icon based on service name or tags
        let serviceIcon = '📦'; // Default icon
        if (svc.tags && svc.tags.length > 0) {
          // Use first tag to determine icon
          const firstTag = svc.tags[0].toLowerCase();
          if (firstTag.includes('cardiology') || firstTag.includes('heart')) serviceIcon = '❤️';
          else if (firstTag.includes('orthopedic') || firstTag.includes('bone')) serviceIcon = '🦴';
          else if (firstTag.includes('physiotherapy') || firstTag.includes('therapy')) serviceIcon = '🏃';
          else if (firstTag.includes('diagnostic') || firstTag.includes('pathology') || firstTag.includes('blood')) serviceIcon = '🩸';
          else if (firstTag.includes('nursing') || firstTag.includes('care')) serviceIcon = '💉';
          else if (firstTag.includes('x-ray') || firstTag.includes('imaging')) serviceIcon = '📷';
        }
        
        // Check if service name contains keywords for icon selection
        const serviceNameLower = serviceLabel.toLowerCase();
        if (serviceNameLower.includes('consultation') || serviceNameLower.includes('doctor')) serviceIcon = '👨‍⚕️';
        else if (serviceNameLower.includes('blood') || serviceNameLower.includes('cbc')) serviceIcon = '🩸';
        else if (serviceNameLower.includes('nursing') || serviceNameLower.includes('care')) serviceIcon = '💉';
        
        servicesMap[serviceKey] = {
          label: serviceLabel,
          icon: serviceIcon,
          packages: [], // Initialize empty packages array - packages are managed separately
          // Store full service data for reference
          serviceData: svc,
          description: svc.description,
          tags: svc.tags || [],
          quick_info: svc.quick_info || {},
          // Store venue information for venue packages
          venue: svc.venue ?? svc.venue_id ?? (typeof svc.venue === 'object' ? svc.venue?.id : null),
          venue_id: svc.venue_id ?? svc.venue ?? (typeof svc.venue === 'object' ? svc.venue?.id : null),
        };
      });
      
      // Update localData with fetched services, preserving existing packages
      setLocalData((prev) => {
        const existingServices = prev[locationId]?.services || {};
        
        // Merge: preserve existing packages for services that already exist
        const mergedServices = {};
        Object.keys(servicesMap).forEach((key) => {
          const existingService = existingServices[key];
          mergedServices[key] = {
            ...servicesMap[key],
            packages: existingService?.packages || [], // Preserve existing packages
          };
        });
        
        // Also preserve any services that aren't in the API response (if any)
        Object.keys(existingServices).forEach((key) => {
          if (!mergedServices[key]) {
            mergedServices[key] = existingServices[key];
          }
        });
        
        return {
          ...prev,
          [locationId]: {
            ...prev[locationId],
            services: mergedServices,
          },
        };
      });
    } catch (err) {
      console.error('Error fetching services:', err);
      const msg = err.response?.data?.message ?? err.response?.data?.detail ?? err.message ?? 'Failed to fetch services';
      setServiceError(msg);
      // Initialize empty services on error
      setLocalData((prev) => ({
        ...prev,
        [locationId]: {
          ...prev[locationId],
          services: prev[locationId]?.services || {},
        },
      }));
    } finally {
      setIsLoadingServices(false);
    }
  }, []);

  // Load services when location is selected
  useEffect(() => {
    if (location && isVsreOwner) {
      loadServicesForLocation(location);
    }
  }, [location, isVsreOwner, loadServicesForLocation]);

  // Load packages for selected service or venue from API
  const loadPackagesForService = useCallback(async (serviceId) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setPackagesError('Authorization token missing. Please log in again.');
      return;
    }
    
    setIsLoadingPackages(true);
    setPackagesError('');
    
    // Determine entity and ID based on packageType
    let entity = 'service';
    let id = serviceId;
    
    if (packageType === 'venue') {
      if (!selectedVenue) {
        setPackagesError('Please select a venue to view venue packages.');
        setIsLoadingPackages(false);
        return;
      }
      entity = 'venue';
      id = selectedVenue;
    } else if (packageType === 'client') {
      if (!selectedClientService) {
        setPackagesError('Please select a client service to view packages.');
        setIsLoadingPackages(false);
        return;
      }
      entity = 'service';
      id = selectedClientService;
    } else {
      // For service packages, require serviceId
      if (!serviceId) {
        setIsLoadingPackages(false);
        return;
      }
    }
    
    try {
      // API format: /booking/packages/by_belongs_to/?id={id}&entity={entity}
      const response = await axios.get(
        `${baseUrl()}/booking/packages/by_belongs_to/?id=${encodeURIComponent(id)}&entity=${entity}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const raw = response.data;
      const list = Array.isArray(raw) ? raw : (raw?.results ?? []);
      const normalized = list.map((p) => ({
        id: p.id,
        name: p.name ?? '',
        price: p.price != null ? (typeof p.price === 'string' ? parseFloat(p.price) : p.price) : 0,
        registration_fees:
          p.registration_fees != null
            ? (typeof p.registration_fees === 'string' ? parseFloat(p.registration_fees) : p.registration_fees)
            : p.registration_fee != null
              ? (typeof p.registration_fee === 'string' ? parseFloat(p.registration_fee) : p.registration_fee)
            : 0,
        is_active: p.is_active,
        period: p.period ?? p.package_type ?? 'DAILY',
        package_type: p.package_type ?? '',
        belong_to: p.belong_to,
        belongs_to_type: p.belongs_to_type,
        desc: p.desc ?? p.description ?? '',
        duration: p.duration ?? p.period ?? p.package_type ?? '',
      }));
      
      if (packageType === 'venue') {
        setVenuePackages(normalized);
      } else if (packageType === 'client') {
        setClientPackages(normalized);
      } else {
        setServicePackages(normalized);
      }
    } catch (err) {
      console.error('Error fetching packages:', err);
      const msg = err.response?.data?.message ?? err.response?.data?.detail ?? err.message ?? 'Failed to fetch packages';
      setPackagesError(msg);
      if (packageType === 'venue') {
        setVenuePackages([]);
      } else if (packageType === 'client') {
        setClientPackages([]);
      } else {
        setServicePackages([]);
      }
    } finally {
      setIsLoadingPackages(false);
    }
  }, [packageType, selectedVenue, selectedClientService]);

  useEffect(() => {
    if (isVsreOwner) {
      if (packageType === 'venue' && selectedVenue) {
        loadPackagesForService('');
      } else if (packageType === 'client' && selectedClientService) {
        loadPackagesForService('');
      } else if (packageType === 'service' && service) {
        loadPackagesForService(service);
      }
    }
  }, [service, packageType, selectedVenue, selectedClientService, isVsreOwner, loadPackagesForService]);

  const locationData = location ? (localData[location] ?? { label: locationsList.find((l) => String(l.id ?? l.pk ?? l.name) === location)?.locality ?? locationsList.find((l) => String(l.id ?? l.pk ?? l.name) === location)?.name ?? location, services: {} }) : null;
  const serviceKeys = locationData ? Object.keys(locationData.services || {}) : [];
  const serviceData = locationData && service ? (locationData.services || {})[service] : null;
  const packages =
    packageType === 'venue' ? venuePackages : packageType === 'client' ? clientPackages : servicePackages;

  const handleLocationChange = async (val) => {
    setLocation(val);
    setService('');
    setSelectedPkg(null);
    
    // Load services for the selected location
    if (val) {
      await loadServicesForLocation(val);
    }
  };

  const handleVenueChange = (val) => {
    setSelectedVenue(val);
    setSelectedPkg(null);
  };

  const handleClientServiceChange = (val) => {
    setSelectedClientService(val);
    setSelectedPkg(null);
  };

  const handleServiceChange = (val) => {
    setService(val);
    setSelectedPkg(null);
  };

  const summary = useMemo(() => {
    if (!selectedPkg || !locationData || !serviceData) return null;
    return {
      location: locationData.label,
      service: serviceData.label,
      ...selectedPkg,
      price: selectedPkg.price,
    };
  }, [selectedPkg, locationData, serviceData]);

  // ─── CRUD: Location (GET above; POST for add) ───────────────────────
  const addLocation = useCallback(async (payload) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) return false;
    setIsSavingLocation(true);
    setLocationError('');
    try {
      const response = await axios.post(
        `${baseUrl()}/booking/location/`,
        {
          location_type: payload.location_type === 'Partners' ? 'CLIENT' : (payload.location_type === 'In_House' ? 'IN_HOUSE' : (payload.location_type || 'IN_HOUSE')),
          building_name: payload.building_name || '',
          address_line1: payload.address_line1 || '',
          address_line2: payload.address_line2 || '',
          locality: payload.locality || '',
          city: payload.city || '',
          state: payload.state || '',
          postal_code: payload.postal_code || '',
        },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const created = response.data;
      const id = String(created?.id ?? created?.pk);
      const label = created?.locality ?? created?.name ?? created?.building_name ?? id;
      setLocationsList((prev) => [...prev, { id: created?.id ?? created?.pk, locality: label, name: label, ...created }]);
      setLocalData((prev) => ({ ...prev, [id]: { label, services: {} } }));
      return true;
    } catch (err) {
      console.error('Error creating location:', err);
      const msg = err.response?.data?.message ?? err.response?.data?.detail ?? err.message ?? 'Failed to create location';
      setLocationError(msg);
      return false;
    } finally {
      setIsSavingLocation(false);
    }
  }, []);

  const editLocation = (oldKey, newKey, label) => {
    setLocalData((prev) => {
      const updated = { ...prev };
      const loc = updated[oldKey] ?? { services: {} };
      if (oldKey !== newKey) {
        delete updated[oldKey];
        updated[newKey] = { ...loc, label };
      } else {
        updated[oldKey] = { ...loc, label };
      }
      return updated;
    });
    setLocationsList((prev) =>
      prev.map((l) => {
        const id = String(l.id ?? l.pk ?? l.name);
        if (id === oldKey) return { ...l, name: label, id: newKey };
        return l;
      })
    );
    if (location === oldKey) setLocation(newKey);
  };

  const deleteLocation = useCallback(async (locationKey) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setLocationError('Authorization token missing. Please log in again.');
      return;
    }
    setIsDeletingLocation(true);
    setLocationError('');
    try {
      await axios.delete(`${baseUrl()}/booking/location/${locationKey}/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (location === locationKey) {
        setLocation('');
        setService('');
        setSelectedPkg(null);
      }
      await loadLocations();
    } catch (err) {
      console.error('Error deleting location:', err);
      const msg = err.response?.data?.message ?? err.response?.data?.detail ?? err.message ?? 'Failed to delete location';
      setLocationError(msg);
    } finally {
      setIsDeletingLocation(false);
    }
  }, [loadLocations]);

  // ─── CRUD: Service (local only) ─────────────────────────────────────
  const addService = (locationKey, serviceKey, label, icon) => {
    setLocalData((prev) => ({
      ...prev,
      [locationKey]: {
        ...prev[locationKey],
        label: prev[locationKey]?.label ?? '',
        services: {
          ...(prev[locationKey]?.services ?? {}),
          [serviceKey]: { label, icon, packages: [] },
        },
      },
    }));
  };

  const editService = (locationKey, oldKey, newKey, label, icon) => {
    setLocalData((prev) => {
      const updated = { ...prev };
      const loc = updated[locationKey] ?? { label: '', services: {} };
      const services = { ...(loc.services ?? {}) };
      const svc = services[oldKey];
      if (oldKey !== newKey) {
        delete services[oldKey];
        services[newKey] = { ...svc, label, icon };
      } else {
        services[oldKey] = { ...svc, label, icon };
      }
      updated[locationKey] = { ...loc, services };
      return updated;
    });
    if (service === oldKey) setService(newKey);
  };

  const deleteService = (locationKey, serviceKey) => {
    setLocalData((prev) => {
      const updated = { ...prev };
      const loc = updated[locationKey] ?? { label: '', services: {} };
      const services = { ...(loc.services ?? {}) };
      delete services[serviceKey];
      updated[locationKey] = { ...loc, services };
      return updated;
    });
    if (service === serviceKey) {
      setService('');
      setSelectedPkg(null);
    }
  };

  // ─── CRUD: Package (create via API) ─────────────────────────────────────
  const addPackage = useCallback(async (locationKey, serviceKey, pkg) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setPackagesError('Authorization token missing. Please log in again.');
      return false;
    }
    setIsSavingPackage(true);
    setPackagesError('');
    try {
      let objectId;
      if (packageType === 'venue' && selectedVenue) {
        objectId = Number(selectedVenue);
      } else if (packageType === 'client' && selectedClientService) {
        objectId = Number(selectedClientService);
      } else {
        objectId = Number(serviceKey);
      }
      
      const registrationFees = Number(pkg.registration_fees ?? pkg.registration_fee) || 0;

      const payload = {
        object_id: objectId,
        name: pkg.name ?? '',
        description: pkg.description ?? pkg.desc ?? '',
        price: Number(pkg.price) || 0,
        registration_fees: registrationFees,
        period: String(pkg.period ?? 'DAILY').toUpperCase(),
        belongs_to_type: 'service',
      };
      const response = await axios.post(`${baseUrl()}/booking/packages/`, payload, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const created = response.data;
      const normalized = {
        id: created.id,
        name: created.name ?? '',
        price: created.price != null ? (typeof created.price === 'string' ? parseFloat(created.price) : created.price) : 0,
        registration_fees:
          created.registration_fees != null
            ? (typeof created.registration_fees === 'string'
                ? parseFloat(created.registration_fees)
                : created.registration_fees)
            : created.registration_fee != null
              ? (typeof created.registration_fee === 'string'
                  ? parseFloat(created.registration_fee)
                  : created.registration_fee)
              : Number(pkg.registration_fees) || 0,
        is_active: created.is_active,
        period: created.period ?? pkg.period ?? 'DAILY',
        package_type: created.package_type ?? 'OPD',
        belong_to: created.belong_to,
        belongs_to_type: created.belongs_to_type ?? (packageType === 'venue' ? 'venue' : 'service'),
        desc: created.description ?? created.desc ?? '',
        duration: created.duration ?? created.package_type ?? '',
      };
      
      if (packageType === 'venue') {
        setVenuePackages((prev) => [...prev, normalized]);
      } else if (packageType === 'client') {
        setClientPackages((prev) => [...prev, normalized]);
      } else {
        setServicePackages((prev) => [...prev, normalized]);
      }
      return true;
    } catch (err) {
      console.error('Error creating package:', err);
      const msg = err.response?.data?.message ?? err.response?.data?.detail ?? err.message ?? 'Failed to create package';
      setPackagesError(msg);
      return false;
    } finally {
      setIsSavingPackage(false);
    }
  }, [packageType, selectedVenue, selectedClientService]);

  const editPackage = useCallback(async (locationKey, serviceKey, pkgId, updatedPkg) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setPackagesError('Authorization token missing. Please log in again.');
      return false;
    }
    setIsSavingPackage(true);
    setPackagesError('');
    try {
      // Format price as string with 2 decimal places (e.g., "25000.00")
      const priceValue = updatedPkg.price ?? 0;
      const priceString = typeof priceValue === 'string' 
        ? parseFloat(priceValue).toFixed(2) 
        : parseFloat(priceValue).toFixed(2);
      
      // Get is_active from updatedPkg, or default to true if not provided
      // When editing, the existing package should have is_active, otherwise default to true
      const isActive = updatedPkg.is_active !== undefined ? updatedPkg.is_active : true;
      
      const registrationFees = Number(updatedPkg.registration_fees ?? updatedPkg.registration_fee) || 0;

      // Payload format: name, price (string), is_active, period, belongs_to_type
      const payload = {
        name: updatedPkg.name ?? '',
        description: updatedPkg.description ?? updatedPkg.desc ?? '',
        price: priceString,
        registration_fees: registrationFees,
        is_active: isActive,
        period: String(updatedPkg.period ?? 'DAILY').toUpperCase(),
        belongs_to_type: 'service',
      };
      
      const response = await axios.patch(`${baseUrl()}/booking/packages/${pkgId}/`, payload, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const updated = response.data;
      const normalized = {
        id: updated.id ?? pkgId,
        name: updated.name ?? updatedPkg.name ?? '',
        price: updated.price != null ? (typeof updated.price === 'string' ? parseFloat(updated.price) : updated.price) : (updatedPkg.price ?? 0),
        registration_fees:
          updated.registration_fees != null
            ? (typeof updated.registration_fees === 'string'
                ? parseFloat(updated.registration_fees)
                : updated.registration_fees)
            : updated.registration_fee != null
              ? (typeof updated.registration_fee === 'string'
                  ? parseFloat(updated.registration_fee)
                  : updated.registration_fee)
              : Number(updatedPkg.registration_fees) || 0,
        is_active: updated.is_active ?? updatedPkg.is_active,
        period: updated.period ?? updatedPkg.period ?? 'DAILY',
        package_type: updated.package_type ?? updatedPkg.package_type ?? 'OPD',
        belong_to: updated.belong_to ?? updatedPkg.belong_to,
        belongs_to_type: updated.belongs_to_type ?? (packageType === 'venue' ? 'venue' : 'service'),
        desc: updated.description ?? updated.desc ?? updatedPkg.desc ?? '',
        duration: updated.duration ?? updatedPkg.duration ?? updated.period ?? updatedPkg.period ?? '',
      };
      
      if (packageType === 'venue') {
        setVenuePackages((prev) => prev.map((p) => (p.id === pkgId ? normalized : p)));
      } else if (packageType === 'client') {
        setClientPackages((prev) => prev.map((p) => (p.id === pkgId ? normalized : p)));
      } else {
        setServicePackages((prev) => prev.map((p) => (p.id === pkgId ? normalized : p)));
      }
      if (selectedPkg?.id === pkgId) setSelectedPkg(normalized);
      return true;
    } catch (err) {
      console.error('Error updating package:', err);
      const msg = err.response?.data?.message ?? err.response?.data?.detail ?? err.message ?? 'Failed to update package';
      setPackagesError(msg);
      return false;
    } finally {
      setIsSavingPackage(false);
    }
  }, [packageType, selectedVenue]);

  const deletePackage = useCallback(async (locationKey, serviceKey, pkgId) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setPackagesError('Authorization token missing. Please log in again.');
      return;
    }
    setDeletingPackageId(pkgId);
    setPackagesError('');
    try {
      await axios.delete(`${baseUrl()}/booking/packages/${pkgId}/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      if (packageType === 'venue') {
        setVenuePackages((prev) => prev.filter((p) => p.id !== pkgId));
      } else if (packageType === 'client') {
        setClientPackages((prev) => prev.filter((p) => p.id !== pkgId));
      } else {
        setServicePackages((prev) => prev.filter((p) => p.id !== pkgId));
      }
      if (selectedPkg?.id === pkgId) setSelectedPkg(null);
    } catch (err) {
      console.error('Error deleting package:', err);
      const msg = err.response?.data?.message ?? err.response?.data?.detail ?? err.message ?? 'Failed to delete package';
      setPackagesError(msg);
    } finally {
      setDeletingPackageId(null);
    }
  }, [packageType]);

  if (!isVsreOwner) {
    return (
      <div className="py-3 px-1">
        <div className="bg-gray-50 rounded-xl p-8 border-2 border-gray-200 text-center">
          <p className="text-gray-700 text-lg font-medium mb-2">Only VSRE_OWNER can access this section.</p>
          {authUser ? (
            <p className="text-sm text-gray-500">
              Current user type: <span className="font-semibold">{authUser.user_type || 'Not found'}</span>
            </p>
          ) : (
            <p className="text-sm text-gray-500">No user logged in. Please log in as VSRE_OWNER.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      {/* Header */}
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-800">Location & Package</h2>
          <p className="text-sm text-gray-500 mt-0.5">Select a location and service, then add or manage packages</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Package Type:</span>
          <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => {
                setPackageType('service')
                setSelectedPkg(null)
                setSelectedVenue('')
                setVenuePackages([])
                setSelectedClientService('')
                setClientPackages([])
              }}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                packageType === 'service'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              Service Packages
            </button>
            <button
              type="button"
              onClick={() => {
                setPackageType('venue')
                setSelectedPkg(null)
                setService('')
                setSelectedClientService('')
                setClientPackages([])
              }}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                packageType === 'venue'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              Venue Packages
            </button>
          </div>
        </div>
      </div>

      {/* Location Section - Show only when packageType is 'service' */}
      {packageType === 'service' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-3">
          <div className="mb-2">
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
              <FiGrid className="w-4 h-4 text-indigo-600" />
              Service Type
            </label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900"
            >
              <option value="IN_HOUSE">IN-HOUSE</option>
              <option value="OPD">OPD</option>
              <option value="CLIENT_SIDE">CLIENT-SIDE</option>
            </select>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 mb-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
              <FiGrid className="w-4 h-4 text-indigo-600" />
              Services
            </label>
          </div>
          {serviceTypeServicesError && (
            <p className="text-sm text-red-600 mb-1.5">{serviceTypeServicesError}</p>
          )}
          {isLoadingServiceTypeServices ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {[...Array(6)].map((_, idx) => (
                <div
                  key={`service-skeleton-${idx}`}
                  className="rounded-lg border border-gray-200 bg-white p-2.5 animate-pulse"
                >
                  <div className="h-4 w-3/4 bg-gray-200 rounded" />
                  <div className="h-3 w-1/2 bg-gray-100 rounded mt-2" />
                </div>
              ))}
            </div>
          ) : serviceTypeServices.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {serviceTypeServices.map((svc) => {
                const isSelected = String(service) === String(svc.id);
                const venueCount = Array.isArray(svc.venue) ? svc.venue.length : 0;
                return (
                  <button
                    key={String(svc.id)}
                    type="button"
                    onClick={() => handleServiceChange(String(svc.id))}
                    className={`text-left rounded-lg border p-2.5 transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'
                    }`}
                  >
                    <p className={`text-sm font-semibold ${isSelected ? 'text-indigo-700' : 'text-gray-800'}`}>
                      {svc.name}
                    </p>
                    
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No services available for selected service type.</p>
          )}
        </div>
      )}

      {/* Venue Dropdown - Show only when packageType is 'venue' */}
      {packageType === 'venue' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 mb-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
              <FiMapPin className="w-4 h-4 text-indigo-600" />
              Select Venue
            </label>
          </div>
          {isLoadingVenues && (
            <p className="text-sm text-gray-500 mb-1.5">Loading venues...</p>
          )}
          {venuesError && (
            <p className="text-sm text-red-600 mb-1.5">{venuesError}</p>
          )}
          <select
            value={selectedVenue}
            onChange={(e) => handleVenueChange(e.target.value)}
            disabled={isLoadingVenues}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900 disabled:opacity-60"
          >
            <option value="">Choose a venue...</option>
            {venuesList.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name} {venue.locality ? `(${venue.locality})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Client-side services dropdown — service_type=CLIENT_SIDE */}
      {packageType === 'client' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 mb-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
              <FiGrid className="w-4 h-4 text-indigo-600" />
              Client services
            </label>
          </div>
          {isLoadingClientServices && (
            <p className="text-sm text-gray-500 mb-1.5">Loading client services...</p>
          )}
          {clientServicesError && (
            <p className="text-sm text-red-600 mb-1.5">{clientServicesError}</p>
          )}
          <select
            value={selectedClientService}
            onChange={(e) => handleClientServiceChange(e.target.value)}
            disabled={isLoadingClientServices}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900 disabled:opacity-60"
          >
            <option value="">Choose a client service...</option>
            {clientServicesList.map((svc) => (
              <option key={svc.id} value={String(svc.id)}>
                {svc.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Packages */}
      {((packageType === 'service' && service) || (packageType === 'venue' && selectedVenue) || (packageType === 'client' && selectedClientService)) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 mb-2">
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
              <FiPackage className="w-4 h-4 text-teal-600" />
              Packages{' '}
              {packageType === 'venue' ? '(Venue)' : packageType === 'client' ? '(Client)' : '(Service)'}
            </label>
            <button
              type="button"
              onClick={() => { 
                setEditingItem(null); 
                setShowPackageModal(true); 
              }}
              disabled={
                isSavingPackage
                || (packageType === 'venue' && !selectedVenue)
                || (packageType === 'service' && !service)
                || (packageType === 'client' && !selectedClientService)
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiPlus className="w-3.5 h-3.5" />
              Add Package
            </button>
          </div>
          {isLoadingPackages && (
            <div className="text-center py-3">
              <div className="inline-flex items-center gap-2 text-sm text-gray-600">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Loading packages...</span>
              </div>
            </div>
          )}
          {packagesError && !isLoadingPackages && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-2">
              <p className="text-sm text-red-600">{packagesError}</p>
            </div>
          )}
          {!isLoadingPackages && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {packages.length === 0 ? (
                <div className="text-center py-4 text-sm text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  No packages available{' '}
                  {packageType === 'venue' ? 'for this venue' : packageType === 'client' ? 'for this client service' : 'for this service'}.
                </div>
              ) : (
                packages.map((pkg) => {
                  const isSelected = selectedPkg?.id === pkg.id;
                  const registrationFeeValue = Number(pkg.registration_fees ?? pkg.registration_fee) || 0;
                  return (
                    <div key={pkg.id} className="relative">
                      <button
                        type="button"
                        onClick={() => setSelectedPkg(pkg)}
                        className={`w-full p-2.5 pr-16 rounded-lg border text-left transition-all ${
                          isSelected ? 'border-teal-500 bg-teal-50 shadow-md' : 'border-gray-200 bg-white hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-gray-900 min-w-0 truncate">{pkg.name}</span>
                          <span className="shrink-0 text-sm font-semibold text-teal-700">
                            ₹{typeof pkg.price === 'number' ? pkg.price.toLocaleString('en-IN') : (pkg.price ?? 0)}
                          </span>
                        </div>
                        {pkg.desc ? (
                          <p className="text-xs text-gray-600 mb-1 line-clamp-2">{pkg.desc}</p>
                        ) : null}
                        <div className="mb-1">
                          <span className="text-[11px] text-gray-500">Registration Fee: </span>
                          <span className="text-xs font-semibold text-gray-800">
                            ₹{registrationFeeValue.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          {(pkg.period || pkg.duration || pkg.package_type) ? (
                            <span className="text-[10px] text-gray-500">🕐 {pkg.period || pkg.duration || pkg.package_type}</span>
                          ) : null}
                          {pkg.package_type ? (
                            <span className="text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                              {pkg.package_type}
                            </span>
                          ) : null}
                        </div>
                      </button>
                      <div className="absolute top-1.5 right-1.5 flex gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingItem(pkg);
                            setShowPackageModal(true);
                          }}
                          disabled={isSavingPackage}
                          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-indigo-600 transition-colors disabled:opacity-50"
                          title="Edit package"
                        >
                          <FiEdit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!window.confirm('Delete this package?')) return;
                            await deletePackage(
                              '',
                              packageType === 'venue' || packageType === 'client' ? '' : service,
                              pkg.id
                            );
                          }}
                          disabled={deletingPackageId === pkg.id}
                          className="p-1.5 rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                          title="Delete package"
                        >
                          {deletingPackageId === pkg.id ? (
                            <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            <FiTrash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showLocationModal && (
        <LocationModal
          editing={editingItem}
          isSaving={isSavingLocation}
          onSave={async (payloadOrKey, labelOrUndefined) => {
            if (editingItem) {
              editLocation(editingItem.key, payloadOrKey, labelOrUndefined);
              setShowLocationModal(false);
            } else {
              const ok = await addLocation(payloadOrKey);
              if (ok) setShowLocationModal(false);
            }
          }}
          onClose={() => setShowLocationModal(false)}
        />
      )}

      {showServiceModal && location && (
        <ServiceModal
          editing={editingItem}
          onSave={(key, label, icon) => {
            if (editingItem) editService(location, editingItem.key, key, label, icon);
            else addService(location, key, label, icon);
            setShowServiceModal(false);
          }}
          onClose={() => setShowServiceModal(false)}
        />
      )}

      {showPackageModal
        && ((packageType === 'service' && service)
          || (packageType === 'venue' && selectedVenue)
          || (packageType === 'client' && selectedClientService)) && (
        <PackageModal
          editing={editingItem}
          isSaving={isSavingPackage}
          isClientPackages={packageType === 'client'}
          onSave={async (pkg) => {
            const locKey = packageType === 'venue' || packageType === 'client' ? '' : location;
            const svcKey = packageType === 'venue' || packageType === 'client' ? '' : service;
            if (editingItem) {
              const ok = await editPackage(locKey, svcKey, editingItem.id, pkg);
              if (ok) setShowPackageModal(false);
            } else {
              const ok = await addPackage(locKey, svcKey, pkg);
              if (ok) setShowPackageModal(false);
            }
          }}
          onClose={() => setShowPackageModal(false)}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────

function LocationModal({ editing, onSave, onClose, isSaving }) {
  const [location_type, setLocationType] = useState(editing?.location_type || 'In_House');
  const [building_name, setBuildingName] = useState(editing?.building_name || '');
  const [address_line1, setAddressLine1] = useState(editing?.address_line1 || '');
  const [address_line2, setAddressLine2] = useState(editing?.address_line2 || '');
  const [locality, setLocality] = useState((editing?.locality ?? editing?.label) || '');
  const [city, setCity] = useState(editing?.city || '');
  const [state, setState] = useState(editing?.state || '');
  const [postal_code, setPostalCode] = useState(editing?.postal_code || '');

  const handleSave = () => {
    if (editing) {
      onSave(editing.key, locality);
      return;
    }
    if (!locality?.trim()) return;
    onSave({
      location_type: location_type,
      building_name: building_name.trim(),
      address_line1: address_line1.trim(),
      address_line2: address_line2.trim(),
      locality: locality.trim(),
      city: city.trim(),
      state: state.trim(),
      postal_code: postal_code.trim(),
    });
  };

  const canSave = editing ? locality?.trim() : locality?.trim();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-1000 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-4">{editing ? 'Edit Location' : 'Add Location'}</h3>

        {editing ? (
          <>
            <label className="block text-xs font-medium text-gray-600 mb-1">Locality</label>
            <input
              type="text"
              placeholder="Locality"
              value={locality}
              onChange={(e) => setLocality(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-4"
            />
          </>
        ) : (
          <>
            <label className="block text-xs font-medium text-gray-600 mb-1">Location type</label>
            <select
              value={location_type}
              onChange={(e) => setLocationType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-3"
            >
              <option value="In_House">In House</option>
              <option value="Partners">Partners</option>
            </select>
            <label className="block text-xs font-medium text-gray-600 mb-1">Building name</label>
            <input
              type="text"
              placeholder="e.g. Tech Park"
              value={building_name}
              onChange={(e) => setBuildingName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-3"
            />
            <label className="block text-xs font-medium text-gray-600 mb-1">Address line 1</label>
            <input
              type="text"
              placeholder="e.g. 123 Main Street"
              value={address_line1}
              onChange={(e) => setAddressLine1(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-3"
            />
            <label className="block text-xs font-medium text-gray-600 mb-1">Address line 2 (optional)</label>
            <input
              type="text"
              placeholder="e.g. Suite 100"
              value={address_line2}
              onChange={(e) => setAddressLine2(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-3"
            />
            <label className="block text-xs font-medium text-gray-600 mb-1">Locality *</label>
            <input
              type="text"
              placeholder="e.g. Downtown"
              value={locality}
              onChange={(e) => setLocality(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-3"
            />
            <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
            <input
              type="text"
              placeholder="e.g. Bangalore"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-3"
            />
            <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
            <input
              type="text"
              placeholder="e.g. Karnataka"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 mb-3"
            />
            <label className="block text-xs font-medium text-gray-600 mb-1">Postal code</label>
            <input
              type="text"
              placeholder="e.g. 560001"
              value={postal_code}
              onChange={(e) => setPostalCode(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-4"
            />
          </>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={isSaving} className="flex-1 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium text-sm hover:bg-gray-50 disabled:opacity-60">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={!canSave || isSaving} className="flex-1 py-2 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 disabled:opacity-60">
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ServiceModal({ editing, onSave, onClose }) {
  const [key, setKey] = useState(editing?.key || '');
  const [label, setLabel] = useState(editing?.label || '');
  const [icon, setIcon] = useState(editing?.icon || '');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-1000" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-[90%] max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-4">{editing ? 'Edit Service' : 'Add Service'}</h3>
        <input
          type="text"
          placeholder="Key (e.g. spa)"
          value={key}
          onChange={(e) => setKey(e.target.value.toLowerCase().replace(/\s/g, ''))}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-3"
        />
        <input
          type="text"
          placeholder="Label (e.g. Spa & Wellness)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-3"
        />
        <input
          type="text"
          placeholder="Icon (e.g. 🧖)"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-4"
        />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={() => key && label && icon && onSave(key, label, icon)} className="flex-1 py-2 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function PackageModal({ editing, onSave, onClose, isSaving, isClientPackages = false }) {
  const [id, setId] = useState(editing?.id ?? `pkg-${Date.now()}`);
  const [name, setName] = useState(editing?.name || '');
  const [duration, setDuration] = useState(editing?.duration || '');
  const [price, setPrice] = useState(editing?.price ?? '');
  const [registrationFee, setRegistrationFee] = useState(editing?.registration_fees ?? editing?.registration_fee ?? '');
  const [desc, setDesc] = useState(editing?.desc || editing?.description || '');
  const [period, setPeriod] = useState(String(editing?.period || editing?.package_type || 'DAILY').toUpperCase());
  const [isActive, setIsActive] = useState(editing?.is_active !== undefined ? editing.is_active : true);

  const canSave = name && price !== '' && desc && period;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id,
      name,
      duration,
      price: price === '' ? '' : Number(price),
      registration_fees: registrationFee === '' ? '' : Number(registrationFee),
      desc,
      description: desc,
      period,
      belongs_to_type: isClientPackages ? 'service' : 'service',
      is_active: isActive,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-1000" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-[90%] max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-4">{editing ? 'Edit Package' : 'Add Package'}</h3>
        <label className="block text-xs font-medium text-gray-600 mb-1">Package Name</label>
        <input
          type="text"
          placeholder="Enter package name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 mb-3"
        />
        <label className="block text-xs font-medium text-gray-600 mb-1">Period</label>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 mb-3 bg-white"
        >
          <option value="DAILY">DAILY</option>
          <option value="WEEKLY">WEEKLY</option>
          <option value="MONTHLY">MONTHLY</option>
          <option value="HOURLY">HOURLY</option>
        </select>
        <label className="block text-xs font-medium text-gray-600 mb-1">Price</label>
        <input
          type="number"
          placeholder="Enter price"
          value={price}
          onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 mb-3"
        />
        <label className="block text-xs font-medium text-gray-600 mb-1">Registration Fee</label>
        <input
          type="number"
          placeholder="Enter registration fee"
          value={registrationFee}
          onChange={(e) => setRegistrationFee(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 mb-3"
        />
        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
        <textarea
          placeholder="Enter package description"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 mb-3 min-h-20 resize-y"
          rows={3}
        />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={isSaving} className="flex-1 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium text-sm hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || isSaving}
            className="flex-1 py-2 rounded-lg bg-teal-600 text-white font-medium text-sm hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LocationPackage;
