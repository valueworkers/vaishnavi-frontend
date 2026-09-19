import { createSlice } from '@reduxjs/toolkit'

const venuesSlice = createSlice({
  name: 'venues',
  initialState: {
    venues: [],
    isLoading: false,
    error: null
  },
  reducers: {
    setVenues: (state, action) => {
      state.venues = action.payload
      state.isLoading = false
      state.error = null
    },
    setLoading: (state, action) => {
      state.isLoading = action.payload
    },
    setError: (state, action) => {
      state.error = action.payload
      state.isLoading = false
    },
    clearVenues: (state) => {
      state.venues = []
      state.isLoading = false
      state.error = null
    }
  }
})

export const { setVenues, setLoading, setError, clearVenues } = venuesSlice.actions
export default venuesSlice.reducer

