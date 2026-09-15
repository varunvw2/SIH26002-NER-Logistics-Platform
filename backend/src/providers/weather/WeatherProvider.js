// Interface (documented via JSDoc, duck-typed - no TS in this JS backend):
//
//   class WeatherProvider {
//     async getDistrictWeather(district) -> {
//       rainfall_mm, condition, forecast_note, source
//     }
//   }
//
// Implementations: MockWeatherProvider (default), OpenWeatherProvider (used
// automatically when OPENWEATHER_API_KEY is set). An IMDProvider slot is
// documented but not implemented - IMD has no public self-serve API suitable
// for a student prototype; OpenWeatherMap's free tier stands in for it.
export class WeatherProvider {
  async getDistrictWeather(_district) {
    throw new Error('Not implemented');
  }
}
