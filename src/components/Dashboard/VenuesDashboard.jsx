import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FaMapMarkerAlt, FaParking, FaMotorcycle, FaCarAlt, FaPlus, FaEdit, FaTrash, FaBed, FaBuilding } from 'react-icons/fa';
import { TiTick, TiTimes } from 'react-icons/ti';
import { IoIosPerson, IoIosPeople } from 'react-icons/io';
import { IoClose } from 'react-icons/io5';
import { MdTableRestaurant } from 'react-icons/md';
import { MdTableBar } from 'react-icons/md';
import classroomTable from '../../assets/class.svg';
import { hasOwnerPrivileges } from '../../utils/authRoles';
import rectTable from '../../assets/6-table.svg';
import roundTable from '../../assets/circular.svg';
import theaterTable from '../../assets/theater.svg';
import dining from '../../assets/dining.svg';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setVenues as setVenuesRedux, setLoading, setError } from '../../store/slices/venuesSlice.js';
import AlertModal from '../AlertModal';
import { compressFileForUpload } from '../../utils/compressUploadFiles';

const seatingIcon = type => {
  switch(type) {
    case 'rectangular': return <img src={rectTable} alt="Rectangular table" className="h-4 w-4 inline-block align-sub" />
    case 'round': return <img src={roundTable} alt="Round table" className="h-4 w-4 inline-block align-sub" />
    case 'theater': return <img src={theaterTable} alt="Theater table" className="h-4 w-4 inline-block align-sub" />
    case 'classroom': return <img src={classroomTable} alt="Classroom table" className="h-4 w-4 inline-block align-sub" />
    case 'banquet': return <MdTableRestaurant className="w-4 h-4 text-blue-600 inline-block align-sub" />
    case 'dining': return <img src={dining} alt='Dining' className='h-4 w-4 inline-block align-sub'/>;
    case 'cocktail': return <MdTableBar className="w-4 h-4 text-gray-600 inline-block align-sub" />;
    default: return <div className="w-4 h-4 border rounded bg-gray-200 inline-block" />
  }
}

// Helper function to format amenity names (replace underscores with spaces and title case)
const formatAmenityName = (amenity) => {
  if (!amenity || typeof amenity !== 'string') return amenity;
  return amenity
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

const seatingOptions = [
  { type: 'Rectangular Table', icon: 'rectangular' },
  { type: 'Round Table', icon: 'round' },
  { type: 'Theater Style', icon: 'theater' },
  { type: 'Banquet', icon: 'banquet' },
  { type: 'Dining Style', icon: 'dining' },
  { type: 'Classroom', icon: 'classroom' },
  { type: 'Cocktail', icon: 'cocktail' },
];

const normalizeVenue = (venue) => {
  // Map seating_arrangement array of strings to objects with type and icon
  const mapSeatingType = (type) => {
    // If it's already an object with type and icon, return it as-is
    if (typeof type === 'object' && type !== null) {
      if (type.type && type.icon) {
        return type
      }
      // If it has type but no icon, extract the type string
      if (type.type) {
        type = type.type
      } else {
        // If it's an object without expected structure, try to convert to string
        type = String(type)
      }
    }
    
    // Ensure type is a string at this point
    if (typeof type !== 'string') {
      type = String(type || 'theater')
    }
    
    const seatingMap = {
      'conference': { type: 'Conference', icon: 'theater' },
      'banquet': { type: 'Banquet', icon: 'round' },
      'classroom': { type: 'Classroom', icon: 'classroom' },
      'round': { type: 'Round Table', icon: 'round' },
      'rectangular': { type: 'Rectangular Table', icon: 'rectangular' },
      'theater': { type: 'Theater Style', icon: 'theater' },
      'dining': { type: 'Dining Style', icon: 'dining' },
      'u-shape': { type: 'U-shape', icon: 'rectangular' },
      'cocktail': { type: 'Cocktail', icon: 'cocktail' },
    }
    const lowerType = type.toLowerCase().replace(/[-_\s]/g, '')
    // Handle variations
    if (lowerType.includes('banquet') || lowerType.includes('round')) return { type: type, icon: 'round' }
    if (lowerType.includes('conference') || lowerType.includes('theater')) return { type: type, icon: 'theater' }
    if (lowerType.includes('classroom')) return { type: type, icon: 'classroom' }
    if (lowerType.includes('rectangular')) return { type: type, icon: 'rectangular' }
    if (lowerType.includes('dining')) return { type: type, icon: 'dining' }
    if (lowerType.includes('ushape') || lowerType.includes('u-shape')) return { type: type, icon: 'rectangular' }
    return seatingMap[lowerType] || { type: type, icon: 'theater' }
  }

  // Helper to build photo URL
  const getPhotoUrl = (photo) => {
    if (typeof photo === 'string') {
      // If it's already a full URL, return it
      if (photo.startsWith('http://') || photo.startsWith('https://')) {
        return photo
      }
      // If it's a relative path, might need backend URL prefix
      // For now, return empty or the path as-is (backend might serve it)
      return photo || ''
    }
    if (photo && typeof photo === 'object') {
      // Try url first, then image field
      if (photo.url) {
        return photo.url.startsWith('http://') || photo.url.startsWith('https://') 
          ? photo.url 
          : photo.url
      }
      if (photo.image) {
        const img = photo.image
        // If image contains a full URL (embedded in path), extract it
        if (img.includes('http://') || img.includes('https://')) {
          const urlMatch = img.match(/https?:\/\/[^\s]+/)
          if (urlMatch) return urlMatch[0]
        }
        // If it's a full URL, return it
        if (img.startsWith('http://') || img.startsWith('https://')) {
          return img
        }
        // Otherwise, return the path as-is (backend should handle serving)
        return img
      }
    }
    return ''
  }

  return {
    ...venue,
    // Location mapping - handle new API structure with address_line1, building_name, etc.
    locality: venue.location?.locality || venue.location?.address_line1 || venue.location?.address_line_1 || venue.location?.city || venue.locality || '',
    location_type: venue.location_type || venue.location?.location_type || venue.locality_type || '',
    location: venue.location?.city || venue.location || '',
    address: venue.location?.full_address 
      || (venue.location?.building_name && venue.location?.address_line1 
        ? `${venue.location.building_name}, ${venue.location.address_line1}${venue.location.address_line2 ? ', ' + venue.location.address_line2 : ''}`
        : '')
      || venue.location?.address_line1 
      || venue.location?.address_line_1 
      || venue.address || '',
    city: venue.location?.city || venue.city || '',
    state: venue.location?.state || venue.state || '',
    postalCode: venue.location?.postal_code || venue.postalCode || venue.postal_code || '',
    buildingName: venue.location?.building_name || venue.buildingName || venue.building_name || '',
    addressLine1: venue.location?.address_line1 || venue.addressLine1 || venue.address_line1 || '',
    addressLine2: venue.location?.address_line2 || venue.addressLine2 || venue.address_line2 || '',
    
    // Parking mapping - handle both singular (car/bike) and plural (cars/bikes) keys
    parking_slots: venue.parking_slots || venue.parking || { car: 0, bike: 0, cars: 0, bikes: 0 },
    parking: venue.parking_slots || venue.parking || { car: 0, bike: 0, cars: 0, bikes: 0 },
    // Keep carParking and bikeParking for backward compatibility
    carParking: (venue.parking_slots?.car || venue.parking_slots?.cars || venue.parking?.car || venue.parking?.cars || venue.carParking || venue.car_parking || 0),
    bikeParking: (venue.parking_slots?.bike || venue.parking_slots?.bikes || venue.parking?.bike || venue.parking?.bikes || venue.bikeParking || venue.bike_parking || 0),
    
    // Permissions mapping
    externalDecorationAllowed: venue.external_decorators_allow !== undefined 
      ? venue.external_decorators_allow 
      : (venue.externalDecorationAllowed !== undefined ? venue.externalDecorationAllowed : false),
    externalCatererAllowed: venue.external_caterers_allow !== undefined 
      ? venue.external_caterers_allow 
      : (venue.externalCatererAllowed !== undefined ? venue.externalCatererAllowed : false),
    
    // Status mapping
    enabled: venue.is_active !== undefined ? venue.is_active : (venue.enabled !== undefined ? venue.enabled : true),
    
    // Seating arrangements - convert string array to object array
    seatingArrangements: venue.seating_arrangement && Array.isArray(venue.seating_arrangement)
      ? venue.seating_arrangement.map(mapSeatingType)
      : (venue.seatingArrangements || []),
    
    // Photos mapping - prioritize photos field, then photos_links, photos_data
    photos: (() => {
      // First check if photos exists and is an array
      if (venue.photos && Array.isArray(venue.photos) && venue.photos.length > 0) {
        return venue.photos.map(getPhotoUrl).filter(url => url);
      }
      // Then check photos_links
      if (venue.photos_links && Array.isArray(venue.photos_links) && venue.photos_links.length > 0) {
        return venue.photos_links.map(getPhotoUrl).filter(url => url);
      }
      // Then check photos_data
      if (venue.photos_data && Array.isArray(venue.photos_data) && venue.photos_data.length > 0) {
        return venue.photos_data.map(getPhotoUrl).filter(url => url);
      }
      // Fallback to imgList or empty array
      return venue.imgList || [];
    })(),
    imgList: (() => {
      // First check if photos exists and is an array
      if (venue.photos && Array.isArray(venue.photos) && venue.photos.length > 0) {
        return venue.photos.map(getPhotoUrl).filter(url => url);
      }
      // Then check photos_links
      if (venue.photos_links && Array.isArray(venue.photos_links) && venue.photos_links.length > 0) {
        return venue.photos_links.map(getPhotoUrl).filter(url => url);
      }
      // Then check photos_data
      if (venue.photos_data && Array.isArray(venue.photos_data) && venue.photos_data.length > 0) {
        return venue.photos_data.map(getPhotoUrl).filter(url => url);
      }
      // Fallback to imgList or empty array
      return venue.imgList || [];
    })(),
    
    // Price mapping - handle string to number conversion
    price: venue.price_per_event ? parseFloat(venue.price_per_event) : (venue.price || 0),
    
    // Capacity
    capacity: venue.capacity || 0,
    
    // Rooms and Floors
    rooms: venue.rooms || 0,
    floors: venue.floors || 0,
    
    // Amenities - ensure it's always an array
    amenities: Array.isArray(venue.amenities) 
      ? venue.amenities 
      : (venue.amenities && typeof venue.amenities === 'object' 
          ? Object.values(venue.amenities).filter(Boolean) 
          : []),
    
    // Keep original fields for backward compatibility
  }
}

const VenuesDashboard = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [authUser, setAuthUser] = useState(null);
  const [venues, setVenues] = useState([]);
  const [selectedSeating, setSelectedSeating] = useState([]);
  const [isLoadingVenues, setIsLoadingVenues] = useState(true);
  const [isSavingVenue, setIsSavingVenue] = useState(false);
  const [alertState, setAlertState] = useState({ open: false, type: 'info', message: '' });
  const showAlert = useCallback((message, type = 'info') => {
    setAlertState({ open: true, type, message: String(message) });
  }, []);
  const closeAlert = useCallback(() => setAlertState(prev => ({ ...prev, open: false })), []);
  const [pagination, setPagination] = useState({
    count: 0,
    total_pages: 1,
    current_page: 1,
    next: null,
    previous: null
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAmenitiesModal, setShowAmenitiesModal] = useState(false);
  const [selectedVenueForEdit, setSelectedVenueForEdit] = useState(null);
  const [selectedVenueForDelete, setSelectedVenueForDelete] = useState(null);
  const [selectedVenueAmenities, setSelectedVenueAmenities] = useState([]);
  const [venueFormData, setVenueFormData] = useState({
    name: '',
    description: '',
    capacity: '',
    locality: '',
    locality_type: '',
    city: '',
    state: '',
    country: 'India',
    postal_code: '',
    venueType: 'Medi care',
    address_line_1: '',
    address_line_2: '',
    buildingName: '',
    rooms: '',
    floors: '',
    carParking: '',
    bikeParking: '',
    externalDecorationAllowed: false,
    externalCatererAllowed: false,
    amenities: [],
    seatingArrangements: [],
    new_photos: [],
    halls: [],
    enabled: true
  });

  // Track object URLs for cleanup
  const [photoObjectUrls, setPhotoObjectUrls] = useState(new Map());
  const [isCompressingPhotos, setIsCompressingPhotos] = useState(false);
  // Carousel: current photo index per venue (venueId -> index)
  const [venuePhotoIndex, setVenuePhotoIndex] = useState({});
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [imageViewerPhotos, setImageViewerPhotos] = useState([]);
  const [imageViewerIndex, setImageViewerIndex] = useState(0);
  const [imageViewerTitle, setImageViewerTitle] = useState('');
  
  // Track venueType locally (not sent to API) - keyed by venue ID (as string)
  // Initialize from localStorage
  const [venueTypeMap, setVenueTypeMap] = useState(() => {
    try {
      const stored = localStorage.getItem('venueTypeMap');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Ensure all keys are strings for consistency
        const map = new Map();
        Object.entries(parsed).forEach(([key, value]) => {
          map.set(String(key), value);
        });
        return map;
      }
    } catch (error) {
      console.error('Error loading venueTypeMap from localStorage:', error);
    }
    return new Map();
  });

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

    const handleAuthChange = () => checkAuthStatus();
    window.addEventListener('auth-changed', handleAuthChange);
    window.addEventListener('storage', handleAuthChange);

    return () => {
      window.removeEventListener('auth-changed', handleAuthChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, []);

  // Save venueTypeMap to localStorage whenever it changes
  useEffect(() => {
    try {
      const mapObject = Object.fromEntries(venueTypeMap);
      localStorage.setItem('venueTypeMap', JSON.stringify(mapObject));
    } catch (error) {
      console.error('Error saving venueTypeMap to localStorage:', error);
    }
  }, [venueTypeMap]);

  // Use ref and AbortController to prevent double API calls (React StrictMode in development)
  const abortControllerRef = useRef(null);
  const isFetchingRef = useRef(false);

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

    let retryTimeout = null;
    let isMounted = true;
    const MAX_RETRIES = 5; // Maximum number of retry attempts

    const fetchVenues = async (retryCount = 0, page = 1) => {
      if (!isMounted || signal.aborted) return;

      const access = localStorage.getItem("access_token");
      const userType = localStorage.getItem("user_type");

      const config = access
        ? { 
            headers: { Authorization: `Bearer ${access}` },
            signal: signal,
            params: { page }
          }
        : { signal: signal, params: { page } };
     
      try {
        setIsLoadingVenues(true);
        dispatch(setLoading(true));
        const response = await axios.get(`${import.meta.env.VITE_BASEURL_CARE}/management/venues/`, config);
        
        // Extract venues from response.data.results
        const venuesData = response.data?.results || response.data || [];
        
        // Extract pagination info
        if (response.data) {
          setPagination({
            count: response.data.count || 0,
            total_pages: response.data.total_pages || 1,
            current_page: response.data.current_page || page,
            next: response.data.next || null,
            previous: response.data.previous || null
          });
        }
        
        // Check if we got valid data
        const hasValidData = Array.isArray(venuesData) && venuesData.length > 0;
        
        if (hasValidData) {
          const normalizedVenues = venuesData.map(normalizeVenue);
          
          if (isMounted) {
            setVenues(normalizedVenues);
            // Store venues in Redux
            dispatch(setVenuesRedux(normalizedVenues));
            
            // Initialize selected seating for each venue
            setSelectedSeating(normalizedVenues.map(v => 
              v.seatingArrangements && v.seatingArrangements.length > 0 
                ? v.seatingArrangements[0] 
                : seatingOptions[0]
            ));
            
            // Extract unique venue types if available
            const uniqueTypes = [...new Set(normalizedVenues.map(v => v.venueType || v.venue_type).filter(Boolean))];
            if (uniqueTypes.length > 0) {
              setVenueTypes(uniqueTypes.sort());
            }
            
            setIsLoadingVenues(false);
            isFetchingRef.current = false;
            return; // Success, stop retrying
          }
        }
        
        // If we got an empty array or data length <= 0, show "No venues found" immediately
        // (No need to retry if API responded successfully but with empty data)
        if (isMounted) {
          setVenues([]);
          dispatch(setVenuesRedux([]));
          // Still update pagination info even if no venues
          if (response.data) {
            setPagination({
              count: response.data.count || 0,
              total_pages: response.data.total_pages || 1,
              current_page: response.data.current_page || page,
              next: response.data.next || null,
              previous: response.data.previous || null
            });
          }
          setIsLoadingVenues(false);
          isFetchingRef.current = false;
        }
      } catch (error) {
        // Don't log or handle errors if request was aborted
        if (axios.isCancel(error) || signal.aborted) {
          return;
        }
        console.error("Error fetching venues:", error);
        if (isMounted && !signal.aborted) {
          // Retry on error, but only up to MAX_RETRIES
          if (retryCount < MAX_RETRIES) {
            retryTimeout = setTimeout(() => {
              if (isMounted && !signal.aborted) {
                fetchVenues(retryCount + 1, page);
              }
            }, 2000); // Retry after 2 seconds
          } else {
            // Max retries reached, show "No venues found"
            setVenues([]);
            dispatch(setVenuesRedux([]));
            dispatch(setError(error.message || 'Failed to fetch venues'));
            setIsLoadingVenues(false);
            isFetchingRef.current = false;
          }
        }
      }
    };
    
    fetchVenues();
    
    // Cleanup function
    return () => {
      isMounted = false;
      isFetchingRef.current = false;
      // Abort any pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [])

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      photoObjectUrls.forEach(url => {
        URL.revokeObjectURL(url);
      });
    };
  }, [photoObjectUrls]);

  const canManageVenues = useMemo(() => hasOwnerPrivileges(authUser), [authUser]);

  // Helper function to check if a venue is Medi care (formerly Senior Care)
  const isSeniorCareVenue = (venue) => {
    if (!venue || !venue.id) return false;
    
    // Check venueType from venue object
    if (venue.venueType === 'Medi care' || venue.venue_type === 'Medi care' || 
        venue.venueType === 'Senior Care' || venue.venue_type === 'Senior Care') {
      return true;
    }
    
    // Check venueTypeMap - use string ID for consistency (all IDs stored as strings)
    const venueIdString = String(venue.id);
    const storedType = venueTypeMap.get(venueIdString);
    return storedType === 'Medi care' || storedType === 'Senior Care';
  };

  const [venueTypes, setVenueTypes] = useState([]);
  const venueImages = useMemo(
    () => [
      'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1484154218962-a197022b5858?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1526228076630-7f2c2c2a34f6?q=80&w=1600&auto=format&fit=crop',
    ],
    []
  );


  const handleFormInputChange = (field, value) => {
    setVenueFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const clearVenuePhotoPreviews = useCallback(() => {
    setPhotoObjectUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return new Map();
    });
  }, []);

  const rebuildPhotoPreviewUrls = useCallback((photos) => {
    setPhotoObjectUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      const next = new Map();
      (photos || []).forEach((photo, index) => {
        if (photo instanceof File) {
          next.set(index, URL.createObjectURL(photo));
        }
      });
      return next;
    });
  }, []);

  const handleAddVenue = () => {
    setSelectedVenueForEdit(null); // Clear selected venue to ensure we're in "add" mode
    setVenueFormData({
      name: '',
      description: '',
      capacity: '',
      locality: '',
      locality_type: '',
      city: '',
      state: '',
      country: 'India',
      postal_code: '',
      venueType: 'Medi care',
      address_line_1: '',
      address_line_2: '',
      buildingName: '',
      rooms: '',
      floors: '',
      carParking: '',
      bikeParking: '',
      externalDecorationAllowed: false,
      externalCatererAllowed: false,
      amenities: [],
      seatingArrangements: [],
      new_photos: [],
      halls: [],
      enabled: true
    });
    clearVenuePhotoPreviews();
    setShowAddModal(true);
  };

  const handleEditVenue = async (venue) => {
    if (!venue.id) {
      showAlert('Venue ID is missing. Cannot edit this venue.', 'warning');
      return;
    }

    try {
      const access = localStorage.getItem("access_token");
      const config = access
        ? { 
            headers: { 
              Authorization: `Bearer ${access}`,
              'Content-Type': 'application/json'
            } 
          }
        : { headers: { 'Content-Type': 'application/json' } };

      // Fetch venue details from API
      const response = await axios.get(
        `${import.meta.env.VITE_BASEURL_CARE}/management/venues/${venue.id}/`,
        config
      );

      const venueData = response.data;
      
      // Normalize the venue data
      const normalizedVenue = normalizeVenue(venueData);
      
      setSelectedVenueForEdit(normalizedVenue);
      // Get venueType from local map if available, otherwise from normalized venue
      // Try both string and number ID formats
      const venueId = normalizedVenue.id;
      const storedVenueType = venueTypeMap.get(String(venueId)) || 
                              venueTypeMap.get(venueId) || 
                              normalizedVenue.venueType || 
                              normalizedVenue.venue_type || 
                              '';
      setVenueFormData({
        name: normalizedVenue.name || '',
        description: normalizedVenue.description || '',
        capacity: normalizedVenue.capacity !== undefined && normalizedVenue.capacity !== null ? String(normalizedVenue.capacity) : '',
        locality: normalizedVenue.locality || normalizedVenue.location?.locality || '',
        locality_type: normalizedVenue.location_type || normalizedVenue.locality_type || '',
        city: normalizedVenue.city || normalizedVenue.location?.city || '',
        state: normalizedVenue.state || normalizedVenue.location?.state || '',
        country: normalizedVenue.country || normalizedVenue.location?.country || 'India',
        postal_code: normalizedVenue.postalCode || normalizedVenue.postal_code || normalizedVenue.location?.postal_code || '',
        venueType: storedVenueType || 'Medi care',
        address_line_1: normalizedVenue.addressLine1 || normalizedVenue.address_line_1 || normalizedVenue.location?.address_line1 || normalizedVenue.address || '',
        address_line_2: normalizedVenue.addressLine2 || normalizedVenue.address_line_2 || normalizedVenue.location?.address_line2 || '',
        buildingName: normalizedVenue.buildingName || normalizedVenue.location?.building_name || normalizedVenue.building_name || '',
        rooms: (normalizedVenue.rooms || 0).toString(),
        floors: (normalizedVenue.floors || 0).toString(),
        carParking: (normalizedVenue.carParking || 0).toString(),
        bikeParking: (normalizedVenue.bikeParking || 0).toString(),
        externalDecorationAllowed: normalizedVenue.externalDecorationAllowed !== undefined ? normalizedVenue.externalDecorationAllowed : (normalizedVenue.features?.externalDecorator || normalizedVenue.external_decorators_allow || false),
        externalCatererAllowed: normalizedVenue.externalCatererAllowed !== undefined ? normalizedVenue.externalCatererAllowed : (normalizedVenue.features?.externalCaterer || normalizedVenue.external_caterers_allow || false),
        amenities: normalizedVenue.amenities || [],
        seatingArrangements: normalizedVenue.seatingArrangements || [],
        new_photos: normalizedVenue.photos && normalizedVenue.photos.length > 0 ? normalizedVenue.photos : (normalizedVenue.imgList && normalizedVenue.imgList.length > 0 ? normalizedVenue.imgList : []),
        halls: (normalizedVenue.halls || []).map(h => ({
          name: h.name || '',
          capacity: (h.capacity ?? '').toString()
        })),
        enabled: normalizedVenue.enabled !== undefined ? normalizedVenue.enabled : (normalizedVenue.status === 'Active')
      });
      setShowEditModal(true);
    } catch (error) {
      let errorMessage = 'Failed to fetch venue details';
      if (error.response?.data) {
        if (error.response.data.detail) {
          errorMessage = error.response.data.detail;
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showAlert(`Error: ${errorMessage}`, 'error');
    }
  };

  const handleDeleteVenue = (venue) => {
    setSelectedVenueForDelete(venue);
    setShowDeleteModal(true);
  };

  const confirmDeleteVenue = async () => {
    if (!selectedVenueForDelete || !selectedVenueForDelete.id) {
      showAlert('Venue ID is missing. Cannot delete this venue.', 'warning');
      return;
    }

    const access = localStorage.getItem("access_token");
    const config = access
      ? { 
          headers: { 
            Authorization: `Bearer ${access}`,
            'Content-Type': 'application/json'
          } 
        }
      : { headers: { 'Content-Type': 'application/json' } };

    try {
      // Make DELETE API call
      await axios.delete(
        `${import.meta.env.VITE_BASEURL_CARE}/management/venues/${selectedVenueForDelete.id}/`,
        config
      );

      // Remove venueType from localStorage map if it exists
      if (selectedVenueForDelete.id) {
        const venueIdString = String(selectedVenueForDelete.id);
        setVenueTypeMap(prev => {
          const newMap = new Map(prev);
          newMap.delete(venueIdString);
          return newMap;
        });
      }

      // Update venues list
      const updatedVenues = venues.filter(v => v.id !== selectedVenueForDelete.id);
      setVenues(updatedVenues);
      // Update Redux store
      dispatch(setVenuesRedux(updatedVenues));
      
      // Update selected seating
      setSelectedSeating(prev => prev.filter((_, i) => venues.findIndex(v => v.id !== selectedVenueForDelete.id) !== i));
      
      // Close modal and clear selection
      setShowDeleteModal(false);
      setSelectedVenueForDelete(null);
      
      showAlert('Venue deleted successfully!', 'success');
    } catch (error) {
      let errorMessage = 'Failed to delete venue';
      if (error.response?.data) {
        if (error.response.data.detail) {
          errorMessage = error.response.data.detail;
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showAlert(`Error: ${errorMessage}`, 'error');
    }
  };

  // Helper function to convert seating arrangement type to API format
  const convertSeatingTypeToAPI = (type) => {
    if (typeof type === 'string') {
      let converted = type.toLowerCase().trim();
      
      // Map common variations to API format
      const typeMap = {
        'round table': 'round_table',
        'rectangular table': 'rectangular_table',
        'theater style': 'theater',
        'theater': 'theater',
        'classroom style': 'classroom',
        'classroom': 'classroom',
        'dining style': 'dining',
        'dining': 'dining',
        'banquet': 'banquet',
        'cocktail': 'cocktail'
      };
      
      // Check if we have a direct mapping
      if (typeMap[converted]) {
        return typeMap[converted];
      }
      
      // Otherwise, convert to snake_case
      return converted
        .replace(/\s+/g, '_')
        .replace(/_style/gi, '')
        .trim();
    }
    return type;
  };

  // Helper function to convert amenities to API format (lowercase with underscores)
  const convertAmenitiesToAPI = (amenities) => {
    return amenities.map(amenity => {
      if (typeof amenity === 'string') {
        return amenity.toLowerCase().replace(/\s+/g, '_');
      }
      return amenity;
    });
  };

  const saveVenue = async () => {
    if (!venueFormData.name || !venueFormData.capacity) {
      showAlert('Please fill in all required fields (Name, Capacity)', 'warning')
      return
    }

    // Validate required location fields - all location fields are mandatory
    if (!venueFormData.buildingName?.trim() || 
        !venueFormData.address_line_1?.trim() || 
        !venueFormData.address_line_2?.trim() || 
        !venueFormData.locality?.trim() || 
        !venueFormData.locality_type ||
        !venueFormData.city?.trim() || 
        !venueFormData.state?.trim() || 
        !venueFormData.postal_code?.trim()) {
      showAlert('Please fill in all location fields: Building Name, Address Line 1, Address Line 2, Locality, Locality Type, City, State, and Postal Code', 'warning')
      return
    }

    if (isSavingVenue) {
      return;
    }

    setIsSavingVenue(true);
    const access = localStorage.getItem("access_token");
    
    try {
      const amenities = (Array.isArray(venueFormData.amenities) && venueFormData.amenities.length > 0)
        ? convertAmenitiesToAPI(venueFormData.amenities)
        : (selectedVenueForEdit?.amenities ? convertAmenitiesToAPI(Array.isArray(selectedVenueForEdit.amenities) ? selectedVenueForEdit.amenities : []) : []);

      // Parse capacity with proper validation
      const capacityValue = venueFormData.capacity === '' || venueFormData.capacity === null || venueFormData.capacity === undefined
        ? 0
        : (() => {
            const parsed = parseInt(String(venueFormData.capacity).trim(), 10);
            return isNaN(parsed) ? 0 : parsed;
          })();

      // Separate File objects from URL strings in photos
      const photoFiles = venueFormData.new_photos.filter(photo => photo instanceof File);

      // Create FormData for multipart/form-data
      const formData = new FormData();

      // Add all text/number fields to FormData
      formData.append('name', venueFormData.name);
      formData.append('description', venueFormData.description || `A beautiful venue for ${venueFormData.venueType || 'events'}`);
      formData.append('capacity', capacityValue);
      formData.append('rooms', venueFormData.rooms === '' ? 0 : (isNaN(parseInt(venueFormData.rooms)) ? 0 : parseInt(venueFormData.rooms)));
      formData.append('floors', venueFormData.floors === '' ? 0 : (isNaN(parseInt(venueFormData.floors)) ? 0 : parseInt(venueFormData.floors)));
      formData.append('is_active', venueFormData.enabled !== false);

      // Append location fields at root level (not nested under location object)
      formData.append('building_name', (venueFormData.buildingName || '').trim());
      formData.append('address_line1', (venueFormData.address_line_1 || venueFormData.address || '').trim());
      formData.append('address_line2', (venueFormData.address_line_2 || '').trim());
      formData.append('locality', (venueFormData.locality || '').trim());
      formData.append('location_type', venueFormData.locality_type);
      formData.append('city', (venueFormData.city || '').trim());
      formData.append('state', (venueFormData.state || '').trim());
      formData.append('postal_code', (venueFormData.postal_code || '').trim());

      // Add nested objects - send as individual fields with dot notation for better backend compatibility
      formData.append('parking_slots', JSON.stringify({
        car: parseInt(venueFormData.carParking) || 0,
        bike: parseInt(venueFormData.bikeParking) || 0
      }));

      // Add arrays as JSON strings
      formData.append('amenities', JSON.stringify(amenities));

      // Add photo files to FormData
      photoFiles.forEach((photoFile, index) => {
        formData.append('photos', photoFile);
      });

      // Configure headers - let axios set Content-Type automatically for FormData (multipart/form-data)
      const config = access
        ? { 
            headers: { 
              Authorization: `Bearer ${access}`
              // Don't set Content-Type - let axios set it automatically with boundary for FormData
            } 
          }
        : { headers: {} };

      // Make API call - PATCH for update, POST for create
      let response;
      if (selectedVenueForEdit?.id) {
        // Update existing venue using PATCH
        response = await axios.patch(
          `${import.meta.env.VITE_BASEURL_CARE}/management/venues/${selectedVenueForEdit.id}/`,
          formData,
          config
        );
      } else {
        // Create new venue using POST
        response = await axios.post(
          `${import.meta.env.VITE_BASEURL_CARE}/management/venues/`,
          formData,
          config
        );
      }
      
      if (response.data) {
        // Save venueType to local map before refreshing
        // Use string IDs for consistency with localStorage
        if (venueFormData.venueType && selectedVenueForEdit?.id) {
          const venueId = String(selectedVenueForEdit.id);
          setVenueTypeMap(prev => {
            const newMap = new Map(prev);
            newMap.set(venueId, venueFormData.venueType);
            return newMap;
          });
        } else if (venueFormData.venueType && response.data.id) {
          // For new venues, save the venueType using the response ID
          const venueId = String(response.data.id);
          setVenueTypeMap(prev => {
            const newMap = new Map(prev);
            newMap.set(venueId, venueFormData.venueType);
            return newMap;
          });
        }
        
        // Refresh venues list to get updated data with current page
        // Use a separate config for GET request (doesn't need FormData headers)
        const getConfig = access
          ? { headers: { Authorization: `Bearer ${access}` }, params: { page: pagination.current_page || 1 } }
          : { params: { page: pagination.current_page || 1 } };
        const venuesResponse = await axios.get(`${import.meta.env.VITE_BASEURL_CARE}/management/venues/`, getConfig);
        const venuesData = venuesResponse.data?.results || venuesResponse.data || [];
        
        // Update pagination info
        if (venuesResponse.data) {
          setPagination({
            count: venuesResponse.data.count || 0,
            total_pages: venuesResponse.data.total_pages || 1,
            current_page: venuesResponse.data.current_page || pagination.current_page || 1,
            next: venuesResponse.data.next || null,
            previous: venuesResponse.data.previous || null
          });
        }
        
        const normalizedVenues = venuesData.map(normalizeVenue);
        setVenues(normalizedVenues);
        // Update Redux store with refreshed venues
        dispatch(setVenuesRedux(normalizedVenues));
        
        // Update selected seating
        setSelectedSeating(normalizedVenues.map(v => 
          v.seatingArrangements && v.seatingArrangements.length > 0 
            ? v.seatingArrangements[0] 
            : seatingOptions[0]
        ));
        
        showAlert(selectedVenueForEdit ? 'Venue updated successfully!' : 'Venue created successfully!', 'success');
      }

      setShowAddModal(false);
      setShowEditModal(false);
      setSelectedVenueForEdit(null);
      clearVenuePhotoPreviews();
    } catch (error) {
      let errorMessage = 'Failed to save venue';
      if (error.response?.data) {
        if (error.response.data.detail) {
          errorMessage = error.response.data.detail;
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showAlert(`Error: ${errorMessage}`, 'error');
    } finally {
      setIsSavingVenue(false);
    }
  }

  // Halls management
  const addHall = () => {
    setVenueFormData(prev => ({
      ...prev,
      halls: [...(prev.halls || []), { name: '', capacity: '' }]
    }));
  };

  const updateHallField = (index, field, value) => {
    setVenueFormData(prev => ({
      ...prev,
      halls: prev.halls.map((h, i) => i === index ? { ...h, [field]: value } : h)
    }));
  };

  const removeHall = (index) => {
    setVenueFormData(prev => ({
      ...prev,
      halls: prev.halls.filter((_, i) => i !== index)
    }));
  };

  // Photo management — compress images when added; compressed files are sent on save
  const handlePhotoFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = '';

    setIsCompressingPhotos(true);
    try {
      const compressedFiles = [];
      for (const raw of files) {
        try {
          const result = await compressFileForUpload(raw, { maxDimension: 1920 });
          compressedFiles.push(result.file);
        } catch {
          compressedFiles.push(raw);
        }
      }

      setVenueFormData((prev) => {
        const nextPhotos = [...prev.new_photos, ...compressedFiles];
        const startIndex = prev.new_photos.length;
        setPhotoObjectUrls((old) => {
          const next = new Map(old);
          compressedFiles.forEach((file, i) => {
            if (file instanceof File) {
              next.set(startIndex + i, URL.createObjectURL(file));
            }
          });
          return next;
        });
        return { ...prev, new_photos: nextPhotos };
      });
    } finally {
      setIsCompressingPhotos(false);
    }
  };

  const removePhotoFromVenue = (index) => {
    setVenueFormData((prev) => {
      const nextPhotos = prev.new_photos.filter((_, i) => i !== index);
      rebuildPhotoPreviewUrls(nextPhotos);
      return { ...prev, new_photos: nextPhotos };
    });
  };

  const getPhotoPreviewUrl = (photo, index) => {
    if (photo instanceof File) {
      return photoObjectUrls.get(index) || '';
    }
    return photo || '';
  };

  // Open amenities modal
  const openAmenitiesModal = (amenities) => {
    setSelectedVenueAmenities(amenities || []);
    setShowAmenitiesModal(true);
  };

  const openImageViewer = (photos, startIndex = 0, title = 'Venue') => {
    const validPhotos = Array.isArray(photos) ? photos.filter(Boolean) : [];
    if (validPhotos.length === 0) return;
    setImageViewerPhotos(validPhotos);
    setImageViewerIndex(Math.min(Math.max(startIndex, 0), validPhotos.length - 1));
    setImageViewerTitle(title || 'Venue');
    setShowImageViewer(true);
  };

  const closeImageViewer = () => {
    setShowImageViewer(false);
    setImageViewerPhotos([]);
    setImageViewerIndex(0);
  };

  const showPrevImage = () => {
    setImageViewerIndex((prev) => (prev <= 0 ? imageViewerPhotos.length - 1 : prev - 1));
  };

  const showNextImage = () => {
    setImageViewerIndex((prev) => (prev >= imageViewerPhotos.length - 1 ? 0 : prev + 1));
  };

  useEffect(() => {
    if (!showImageViewer) return;

    const handleImageViewerKeys = (event) => {
      if (event.key === 'Escape') {
        setShowImageViewer(false);
        return;
      }

      if (imageViewerPhotos.length <= 1) return;
      if (event.key === 'ArrowLeft') {
        setImageViewerIndex((prev) => (prev <= 0 ? imageViewerPhotos.length - 1 : prev - 1));
      } else if (event.key === 'ArrowRight') {
        setImageViewerIndex((prev) => (prev >= imageViewerPhotos.length - 1 ? 0 : prev + 1));
      }
    };

    window.addEventListener('keydown', handleImageViewerKeys);
    return () => window.removeEventListener('keydown', handleImageViewerKeys);
  }, [showImageViewer, imageViewerPhotos.length]);

  // Pagination handlers
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.total_pages && newPage !== pagination.current_page) {
      const access = localStorage.getItem("access_token");
      const config = access
        ? { 
            headers: { Authorization: `Bearer ${access}` },
            params: { page: newPage }
          }
        : { params: { page: newPage } };
      
      setIsLoadingVenues(true);
      axios.get(`${import.meta.env.VITE_BASEURL_CARE}/management/venues/`, config)
        .then(response => {
          const venuesData = response.data?.results || response.data || [];
          
          // Update pagination info
          if (response.data) {
            setPagination({
              count: response.data.count || 0,
              total_pages: response.data.total_pages || 1,
              current_page: response.data.current_page || newPage,
              next: response.data.next || null,
              previous: response.data.previous || null
            });
          }
          
          const normalizedVenues = venuesData.map(normalizeVenue);
          setVenues(normalizedVenues);
          dispatch(setVenuesRedux(normalizedVenues));
          
          // Update selected seating
          setSelectedSeating(normalizedVenues.map(v => 
            v.seatingArrangements && v.seatingArrangements.length > 0 
              ? v.seatingArrangements[0] 
              : seatingOptions[0]
          ));
          
          setIsLoadingVenues(false);
        })
        .catch(error => {
          console.error("Error fetching venues:", error);
          setIsLoadingVenues(false);
          dispatch(setError(error.message || 'Failed to fetch venues'));
        });
    }
  };

  return (
    <>
    <div className="py-3 px-1">
      <div className="max-w-5xl mx-auto">
        {canManageVenues && (
          <div className="mb-3 flex justify-end gap-2">
            <button
              onClick={handleAddVenue}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow flex items-center gap-2"
            >
              <FaPlus className="w-4 h-4" />
              Add Venue
            </button>
          </div>
        )}
        
        <div className="flex flex-col gap-2">
          {isLoadingVenues ? (
            <div className="bg-white rounded-lg p-8 text-center">
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <p className="text-gray-600">Loading venues...</p>
                <p className="text-sm text-gray-400">Fetching data...</p>
              </div>
            </div>
          ) : venues.length === 0 ? (
            <div className="bg-white rounded-lg p-8 text-center text-gray-600">No venues found.</div>
          ) : (
            venues.map((venue, i) => (
              <div key={venue.id || venue.name} className="bg-white rounded-lg flex flex-row items-center overflow-hidden shadow border border-gray-200 min-h-[90px] p-0 md:p-0">
                {/* Image carousel */}
                {(() => {
                  const photoList = (venue.photos && venue.photos.length > 0) ? venue.photos : ((venue.imgList && venue.imgList.length > 0) ? venue.imgList : ['https://via.placeholder.com/300']);
                  const venueKey = venue.id ?? venue.name ?? i;
                  const currentIndex = Math.min(Math.max(0, venuePhotoIndex[venueKey] ?? 0), photoList.length - 1);
                  const setIndex = (next) => {
                    setVenuePhotoIndex(prev => ({ ...prev, [venueKey]: next }));
                  };
                  const goPrev = () => setIndex(currentIndex <= 0 ? photoList.length - 1 : currentIndex - 1);
                  const goNext = () => setIndex(currentIndex >= photoList.length - 1 ? 0 : currentIndex + 1);
                  const hasMultiple = photoList.length > 1;
                  return (
                    <div className="relative w-32 md:w-40 h-24 md:h-40 rounded-l-lg overflow-hidden shrink-0 bg-gray-100">
                      <img
                        src={photoList[currentIndex]}
                        alt={`${venue.name} photo ${currentIndex + 1}`}
                        className="object-cover w-full h-full cursor-zoom-in"
                        onClick={(e) => {
                          e.stopPropagation();
                          openImageViewer(photoList, currentIndex, venue.name);
                        }}
                      />
                      <span className="absolute left-2 bottom-2 bg-black/80 text-white px-2 py-0.5 text-xs rounded font-semibold">
                        {currentIndex + 1} / {photoList.length}
                      </span>
                      {hasMultiple && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); goPrev(); }}
                            className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-sm font-bold shadow transition-colors"
                            aria-label="Previous photo"
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); goNext(); }}
                            className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-sm font-bold shadow transition-colors"
                            aria-label="Next photo"
                          >
                            ›
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}
                {/* Info */}
                <div className="flex-1 px-3 py-1.5 flex flex-col gap-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0">
                    <span className="font-semibold text-black text-sm truncate">{venue.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${venue.enabled !== false ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                      {venue.enabled === false ? 'Hidden' : 'Active'}
                    </span>
                    <FaMapMarkerAlt className="ml-2 text-blue-700 h-3 w-3" />
                    <span className="text-xs text-gray-800">{venue.locality}</span>
                    <div className="flex items-center ml-2 group relative">
                      <IoIosPerson className="text-gray-700 h-4.5 w-4.5" />
                      <span className="text-xs text-black ml-1">{Math.min(100, venue.capacity || 0)}</span>
                      <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-10">
                        Minimum Persons
                      </span>
                    </div>
                    <div className="flex items-center ml-2 group relative">
                      <IoIosPeople className="text-gray-700 h-4.5 w-4.5" />
                      <span className="text-xs text-black ml-1">{venue.capacity || venue.maxPax || 0}</span>
                      <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-10">
                        Maximum Persons
                      </span>
                    </div>
                    {(Number(venue.rooms) || 0) > 0 && <span className="text-xs ml-2 text-black">Rooms {venue.rooms}</span>}
                    {(Number(venue.floors) || 0) > 0 && <span className="text-xs ml-2 text-black">Floors {venue.floors}</span>}
                    {(venue.bikeParking > 0 || venue.carParking > 0) && (
                      <>
                        <FaParking className="ml-2 text-gray-700 h-3.5 w-3.5"/>
                        {venue.bikeParking > 0 && (
                          <>
                            <FaMotorcycle className="h-4 w-4 text-gray-700" />
                            <span className="text-xs text-black">{venue.bikeParking}</span>
                          </>
                        )}
                        {venue.carParking > 0 && (
                          <>
                            <FaCarAlt className="ml-2 text-gray-700 h-3.5 w-3.5" />
                            <span className="text-xs text-black ">{venue.carParking}</span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  {/* Amenities - Only show if amenities exist */}
                  {venue.amenities && venue.amenities.length > 0 && (
                    <div className="mt-1 text-xs">
                      <div className="text-[10px] text-gray-600 font-medium mb-1">Amenities:</div>
                      <div className="flex flex-wrap gap-1">
                        {venue.amenities.slice(0, 2).map(am => (
                          <span key={am} className="bg-gray-100 rounded px-2 py-1 font-medium text-gray-700 text-xs">
                            {formatAmenityName(am)}
                          </span>
                        ))}
                        {venue.amenities.length > 2 && (
                          <button
                            onClick={() => openAmenitiesModal(venue.amenities)}
                            className="text-xs text-blue-600 hover:text-blue-800 underline cursor-pointer"
                          >
                            +{venue.amenities.length - 2} more
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {/* Price/Select */}
                <div className="flex flex-col justify-between items-end h-full pl-2 pr-3 py-1 min-w-[100px]">
                  {/* <div className="text-xl text-black font-bold whitespace-nowrap">{venue.price} <span className="text-xs font-normal">/ Pax</span></div>
                  <div className="text-[11px] text-gray-600 -mt-0.5 mb-1">Inclusive of food</div> */}
                  <div className="flex flex-col gap-1">
                    {canManageVenues && (
                      <div className="flex gap-1">
                        <button onClick={() => handleEditVenue(venue)} className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-4 py-1.5 rounded-md font-semibold shadow flex items-center gap-1 justify-center">
                          <FaEdit className="w-3 h-3" />
                          Edit
                        </button>
                        <button onClick={() => handleDeleteVenue(venue)} className="bg-red-600 hover:bg-red-700 text-white text-xs px-4 py-1.5 rounded-md font-semibold shadow flex items-center gap-1 justify-center">
                          <FaTrash className="w-3 h-3" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        
        {/* Pagination Controls */}
        {pagination.count > 0 && (
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-between bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <div className="text-sm text-gray-600 mb-2 sm:mb-0">
              Showing page {pagination.current_page} of {pagination.total_pages || 1} ({pagination.count} total venues)
            </div>
            {pagination.total_pages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(pagination.current_page - 1)}
                  disabled={!pagination.previous || isLoadingVenues}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                >
                  Previous
                </button>
                
                {/* Page Numbers */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: pagination.total_pages }, (_, i) => i + 1)
                    .filter(page => {
                      // Show first page, last page, current page, and pages around current
                      const current = pagination.current_page;
                      const total = pagination.total_pages;
                      return (
                        page === 1 ||
                        page === total ||
                        (page >= current - 1 && page <= current + 1)
                      );
                    })
                    .map((page, index, array) => {
                      // Add ellipsis if there's a gap
                      const prevPage = array[index - 1];
                      const showEllipsisBefore = prevPage && page - prevPage > 1;
                      
                      return (
                        <React.Fragment key={page}>
                          {showEllipsisBefore && (
                            <span className="px-2 py-1 text-gray-500">...</span>
                          )}
                          <button
                            onClick={() => handlePageChange(page)}
                            disabled={isLoadingVenues}
                            className={`px-3 py-2 text-sm font-medium rounded-md ${
                              page === pagination.current_page
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                            } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white`}
                          >
                            {page}
                          </button>
                        </React.Fragment>
                      );
                    })}
                </div>
                
                <button
                  onClick={() => handlePageChange(pagination.current_page + 1)}
                  disabled={!pagination.next || isLoadingVenues}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Venue Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Add New Venue</h3>
              <button
                onClick={() => {
                clearVenuePhotoPreviews();
                setShowAddModal(false);
              }}
                className="text-gray-500 hover:text-gray-700"
              >
                <IoClose className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue Name *</label>
                <input
                  type="text"
                  value={venueFormData.name}
                  onChange={(e) => handleFormInputChange('name', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-black"
                  placeholder="Enter venue name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={venueFormData.description}
                  onChange={(e) => handleFormInputChange('description', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-black"
                  placeholder="Enter venue description"
                  rows="3"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacity *</label>
                <input
                  type="number"
                  value={venueFormData.capacity}
                  onChange={(e) => handleFormInputChange('capacity', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-black"
                  placeholder="Enter capacity"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Building Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={venueFormData.buildingName}
                  onChange={(e) => handleFormInputChange('buildingName', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-black"
                  placeholder="Enter building name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={venueFormData.address_line_1}
                  onChange={(e) => handleFormInputChange('address_line_1', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-black"
                  placeholder="Enter address line 1"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={venueFormData.address_line_2}
                  onChange={(e) => handleFormInputChange('address_line_2', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-black"
                  placeholder="Enter address line 2"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Locality <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={venueFormData.locality}
                    onChange={(e) => handleFormInputChange('locality', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                    placeholder="Enter locality"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Locality Type <span className="text-red-500">*</span></label>
                  <select
                    value={venueFormData.locality_type || ''}
                    onChange={(e) => handleFormInputChange('locality_type', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black bg-white"
                    required
                  >
                    <option value="">Select locality type</option>
                    <option value="OPD">OPD</option>
                    <option value="IN_HOUSE">IN HOUSE</option>
                    <option value="CLIENT_SIDE">CLIENT SIDE</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={venueFormData.city}
                    onChange={(e) => handleFormInputChange('city', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                    placeholder="Enter city"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={venueFormData.state}
                    onChange={(e) => handleFormInputChange('state', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                    placeholder="Enter state"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={venueFormData.postal_code}
                    onChange={(e) => handleFormInputChange('postal_code', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                    placeholder="Enter postal code"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input
                    type="text"
                    value={venueFormData.country}
                    onChange={(e) => handleFormInputChange('country', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                    placeholder="Enter country"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rooms</label>
                  <input
                    type="number"
                    value={venueFormData.rooms}
                    onChange={(e) => handleFormInputChange('rooms', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                    placeholder="Rooms"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Floors</label>
                  <input
                    type="number"
                    value={venueFormData.floors}
                    onChange={(e) => handleFormInputChange('floors', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                    placeholder="Floors"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Car Parking</label>
                  <input
                    type="number"
                    value={venueFormData.carParking}
                    onChange={(e) => handleFormInputChange('carParking', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                    placeholder="Car spaces"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bike Parking</label>
                  <input
                    type="number"
                    value={venueFormData.bikeParking}
                    onChange={(e) => handleFormInputChange('bikeParking', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                    placeholder="Bike spaces"
                  />
                </div>
              </div>
              {/* Halls Management */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Halls (optional)</label>
                  <button
                    type="button"
                    onClick={addHall}
                    className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                  >
                    Add Hall
                  </button>
                </div>
                {(venueFormData.halls || []).length === 0 && (
                  <div className="text-xs text-gray-500">No halls added.</div>
                )}
                <div className="space-y-2">
                  {(venueFormData.halls || []).map((hall, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        <label className="block text-xs text-gray-600 mb-1">Hall Name</label>
                        <input
                          type="text"
                          value={hall.name}
                          onChange={(e) => updateHallField(index, 'name', e.target.value)}
                          className="w-full px-3 py-2 border rounded-md text-black"
                          placeholder="e.g., Grand Ballroom"
                        />
                      </div>
                      <div className="col-span-6">
                        <label className="block text-xs text-gray-600 mb-1">Capacity</label>
                        <input
                          type="number"
                          value={hall.capacity}
                          onChange={(e) => updateHallField(index, 'capacity', e.target.value)}
                          className="w-full px-3 py-2 border rounded-md text-black"
                          placeholder="e.g., 200"
                        />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeHall(index)}
                          className="px-2 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                          title="Remove hall"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Photo Management */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Venue Photos</label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      id="photo-file-input"
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={isCompressingPhotos}
                      onChange={handlePhotoFileChange}
                      className="flex-1 px-3 py-2 border rounded-md text-black file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-60"
                    />
                  </div>
                  {isCompressingPhotos && (
                    <p className="text-xs text-amber-700">Compressing photos…</p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {venueFormData.new_photos.map((photo, index) => (
                      <div key={`${photo instanceof File ? photo.name : photo}-${index}`} className="relative">
                        <img
                          src={getPhotoPreviewUrl(photo, index)}
                          alt={`Venue photo ${index + 1}`}
                          className="w-full h-20 object-cover rounded border"
                          onError={(e) => {
                            e.target.src = ''
                          }}
                        />
                        <div className="absolute bottom-1 left-1 right-8 bg-black/60 text-white text-xs px-1 py-0.5 rounded truncate">
                          {photo instanceof File ? photo.name : 'Photo'}
                        </div>
                        <button
                          type="button"
                          onClick={() => removePhotoFromVenue(index)}
                          aria-label={`Remove ${photo instanceof File ? photo.name : 'photo'}`}
                          className="absolute top-1 right-1 w-7 h-7 bg-red-600 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-700 z-10"
                        >
                          <IoClose className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Amenities */}
              {/* Amenities Management */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amenities</label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add amenity (press Enter)"
                      className="flex-1 px-3 py-2 border rounded-md text-black"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const amenity = e.target.value.trim();
                          if (amenity && Array.isArray(venueFormData.amenities) && !venueFormData.amenities.includes(amenity)) {
                            handleFormInputChange('amenities', [...venueFormData.amenities, amenity]);
                            e.target.value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        const input = e.target.previousElementSibling;
                        const amenity = input.value.trim();
                        if (amenity && !venueFormData.amenities.includes(amenity)) {
                          handleFormInputChange('amenities', [...venueFormData.amenities, amenity]);
                          input.value = '';
                        }
                      }}
                      className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Array.isArray(venueFormData.amenities) && venueFormData.amenities.map((amenity, index) => (
                      <span key={index} className="bg-gray-100 rounded px-3 py-1 text-xs font-medium text-gray-700 flex items-center gap-1">
                        {formatAmenityName(amenity)}
                        <button
                          type="button"
                          onClick={() => handleFormInputChange('amenities', (venueFormData.amenities || []).filter((_, i) => i !== index))}
                          className="text-red-600 hover:text-red-800"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={venueFormData.enabled}
                  onChange={(e) => handleFormInputChange('enabled', e.target.checked)}
                  className="mr-2"
                />
                <label className="text-sm font-medium text-gray-700">Enable this venue</label>
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button
                  onClick={() => {
                    clearVenuePhotoPreviews();
                    setShowAddModal(false);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveVenue}
                  disabled={isSavingVenue || isCompressingPhotos}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSavingVenue ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Saving...
                    </>
                  ) : (
                    'Add Venue'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Venue Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Edit Venue</h3>
              <button
                onClick={() => {
                  clearVenuePhotoPreviews();
                  setShowEditModal(false);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <IoClose className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue Name *</label>
                <input
                  type="text"
                  value={venueFormData.name}
                  onChange={(e) => handleFormInputChange('name', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={venueFormData.description}
                  onChange={(e) => handleFormInputChange('description', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-black"
                  placeholder="Enter venue description"
                  rows="3"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacity *</label>
                <input
                  type="number"
                  value={venueFormData.capacity}
                  onChange={(e) => handleFormInputChange('capacity', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Building Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={venueFormData.buildingName}
                  onChange={(e) => handleFormInputChange('buildingName', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-black"
                  placeholder="Enter building name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={venueFormData.address_line_1}
                  onChange={(e) => handleFormInputChange('address_line_1', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-black"
                  placeholder="Enter address line 1"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={venueFormData.address_line_2}
                  onChange={(e) => handleFormInputChange('address_line_2', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-black"
                  placeholder="Enter address line 2"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Locality <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={venueFormData.locality}
                    onChange={(e) => handleFormInputChange('locality', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                    placeholder="Enter locality"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Locality Type <span className="text-red-500">*</span></label>
                  <select
                    value={venueFormData.locality_type || ''}
                    onChange={(e) => handleFormInputChange('locality_type', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black bg-white"
                    required
                  >
                    <option value="">Select locality type</option>
                    <option value="OPD">OPD</option>
                    <option value="IN_HOUSE">IN HOUSE</option>
                    <option value="CLIENT_SIDE">CLIENT SIDE</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={venueFormData.city}
                    onChange={(e) => handleFormInputChange('city', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                    placeholder="Enter city"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={venueFormData.state}
                    onChange={(e) => handleFormInputChange('state', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                    placeholder="Enter state"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={venueFormData.postal_code}
                    onChange={(e) => handleFormInputChange('postal_code', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                    placeholder="Enter postal code"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input
                    type="text"
                    value={venueFormData.country}
                    onChange={(e) => handleFormInputChange('country', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                    placeholder="Enter country"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rooms</label>
                  <input
                    type="number"
                    value={venueFormData.rooms}
                    onChange={(e) => handleFormInputChange('rooms', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Floors</label>
                  <input
                    type="number"
                    value={venueFormData.floors}
                    onChange={(e) => handleFormInputChange('floors', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Car Parking</label>
                  <input
                    type="number"
                    value={venueFormData.carParking}
                    onChange={(e) => handleFormInputChange('carParking', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bike Parking</label>
                  <input
                    type="number"
                    value={venueFormData.bikeParking}
                    onChange={(e) => handleFormInputChange('bikeParking', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-black"
                  />
                </div>
              </div>
              {/* Halls Management */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Halls (optional)</label>
                  <button
                    type="button"
                    onClick={addHall}
                    className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                  >
                    Add Hall
                  </button>
                </div>
                {(venueFormData.halls || []).length === 0 && (
                  <div className="text-xs text-gray-500">No halls added.</div>
                )}
                <div className="space-y-2">
                  {(venueFormData.halls || []).map((hall, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        <label className="block text-xs text-gray-600 mb-1">Hall Name</label>
                        <input
                          type="text"
                          value={hall.name}
                          onChange={(e) => updateHallField(index, 'name', e.target.value)}
                          className="w-full px-3 py-2 border rounded-md text-black"
                          placeholder="e.g., Grand Ballroom"
                        />
                      </div>
                      <div className="col-span-6">
                        <label className="block text-xs text-gray-600 mb-1">Capacity</label>
                        <input
                          type="number"
                          value={hall.capacity}
                          onChange={(e) => updateHallField(index, 'capacity', e.target.value)}
                          className="w-full px-3 py-2 border rounded-md text-black"
                          placeholder="e.g., 200"
                        />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeHall(index)}
                          className="px-2 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                          title="Remove hall"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Photo Management */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Venue Photos</label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      id="photo-file-edit-input"
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={isCompressingPhotos}
                      onChange={handlePhotoFileChange}
                      className="flex-1 px-3 py-2 border rounded-md text-black file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-60"
                    />
                  </div>
                  {isCompressingPhotos && (
                    <p className="text-xs text-amber-700">Compressing photos…</p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {venueFormData.new_photos.map((photo, index) => (
                      <div key={`${photo instanceof File ? photo.name : photo}-${index}`} className="relative">
                        <img
                          src={getPhotoPreviewUrl(photo, index)}
                          alt={`Venue photo ${index + 1}`}
                          className="w-full h-20 object-cover rounded border"
                          onError={(e) => {
                            e.target.src = ''
                          }}
                        />
                        <div className="absolute bottom-1 left-1 right-8 bg-black/60 text-white text-xs px-1 py-0.5 rounded truncate">
                          {photo instanceof File ? photo.name : 'Photo'}
                        </div>
                        <button
                          type="button"
                          onClick={() => removePhotoFromVenue(index)}
                          aria-label={`Remove ${photo instanceof File ? photo.name : 'photo'}`}
                          className="absolute top-1 right-1 w-7 h-7 bg-red-600 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-700 z-10"
                        >
                          <IoClose className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Amenities */}
              {/* Amenities Management */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amenities</label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add amenity (press Enter)"
                      className="flex-1 px-3 py-2 border rounded-md text-black"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const amenity = e.target.value.trim();
                          if (amenity && Array.isArray(venueFormData.amenities) && !venueFormData.amenities.includes(amenity)) {
                            handleFormInputChange('amenities', [...venueFormData.amenities, amenity]);
                            e.target.value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        const input = e.target.previousElementSibling;
                        const amenity = input.value.trim();
                        if (amenity && !venueFormData.amenities.includes(amenity)) {
                          handleFormInputChange('amenities', [...venueFormData.amenities, amenity]);
                          input.value = '';
                        }
                      }}
                      className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Array.isArray(venueFormData.amenities) && venueFormData.amenities.map((amenity, index) => (
                      <span key={index} className="bg-gray-100 rounded px-3 py-1 text-xs font-medium text-gray-700 flex items-center gap-1">
                        {formatAmenityName(amenity)}
                        <button
                          type="button"
                          onClick={() => handleFormInputChange('amenities', (venueFormData.amenities || []).filter((_, i) => i !== index))}
                          className="text-red-600 hover:text-red-800"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={venueFormData.enabled}
                  onChange={(e) => handleFormInputChange('enabled', e.target.checked)}
                  className="mr-2"
                />
                <label className="text-sm font-medium text-gray-700">Enable this venue</label>
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button
                  onClick={() => {
                    clearVenuePhotoPreviews();
                    setShowEditModal(false);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveVenue}
                  disabled={isSavingVenue || isCompressingPhotos}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSavingVenue ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedVenueForDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Confirm Delete</h3>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <IoClose className="w-6 h-6" />
              </button>
            </div>
            <div className="mb-6">
              <p className="text-gray-600">
                Are you sure you want to delete <strong>"{selectedVenueForDelete?.name}"</strong>?
              </p>
              <p className="text-sm text-red-600 mt-2">This action cannot be undone.</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteVenue}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete Venue
              </button>
            </div>
          </div>
        </div>
      )}

      {showImageViewer && imageViewerPhotos.length > 0 && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60] p-4"
          onClick={closeImageViewer}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeImageViewer();
            }}
            className="absolute top-4 right-4 text-white hover:text-gray-200"
            aria-label="Close image viewer"
          >
            <IoClose className="w-8 h-8" />
          </button>

          <div
            className="relative w-full max-w-5xl flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {imageViewerPhotos.length > 1 && (
              <button
                type="button"
                onClick={showPrevImage}
                className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-2xl z-10"
                aria-label="Previous image"
              >
                ‹
              </button>
            )}

            <img
              src={imageViewerPhotos[imageViewerIndex]}
              alt={`${imageViewerTitle} photo ${imageViewerIndex + 1}`}
              className="w-full max-h-[82vh] object-contain rounded-lg"
            />

            {imageViewerPhotos.length > 1 && (
              <button
                type="button"
                onClick={showNextImage}
                className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-2xl z-10"
                aria-label="Next image"
              >
                ›
              </button>
            )}

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 text-white px-3 py-1 rounded text-sm">
              {imageViewerIndex + 1} / {imageViewerPhotos.length}
            </div>
          </div>
        </div>
      )}

      {/* Amenities Modal */}
      {showAmenitiesModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-96 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">All Amenities</h3>
              <button
                onClick={() => setShowAmenitiesModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <IoClose className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-2">
              {selectedVenueAmenities.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedVenueAmenities.map((amenity, index) => (
                    <span
                      key={index}
                      className="bg-gray-100 rounded px-3 py-2 text-sm font-medium text-gray-700"
                    >
                      {formatAmenityName(amenity)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No amenities available.</p>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowAmenitiesModal(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    <AlertModal open={alertState.open} type={alertState.type} message={alertState.message} onClose={closeAlert} />
    </>
  );
};

export default VenuesDashboard;
