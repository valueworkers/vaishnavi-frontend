import { configureStore } from '@reduxjs/toolkit'
import cityReducer from './slices/citySlice'
import venuesReducer from './slices/venuesSlice'
import ermReducer from './slices/ermSlice'

export const store = configureStore({
  reducer: {
    city: cityReducer,
    venues: venuesReducer,
    erm: ermReducer,
  },
})

