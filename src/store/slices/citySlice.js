import { createSlice } from '@reduxjs/toolkit'

const getInitialCity = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem('selectedCity')
      return stored || 'Select City'
    }
  } catch (_) {}
  return 'Select City'
}

const citySlice = createSlice({
  name: 'city',
  initialState: {
    selectedCity: getInitialCity()
  },
  reducers: {
    updateCity: (state, action) => {
      state.selectedCity = action.payload
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('selectedCity', action.payload)
        }
      } catch (_) {}
    }
  }
})

export const { updateCity } = citySlice.actions
export default citySlice.reducer

