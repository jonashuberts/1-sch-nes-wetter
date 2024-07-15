// Wait for the DOM to be fully loaded before running the script
document.addEventListener("DOMContentLoaded", function () {
  // Get references to the manual location checkbox and its associated fields
  const manualLocationCheckbox = document.getElementById("manualLocation");
  const manualLocationFields = document.getElementById("manualLocationFields");

  // Event listener for the manual location checkbox
  manualLocationCheckbox.addEventListener("change", function () {
    if (manualLocationCheckbox.checked) {
      manualLocationFields.style.display = "block"; // Show manual location fields if checked
    } else {
      manualLocationFields.style.display = "none"; // Hide manual location fields if unchecked
    }
  });

  // Event listener for form submission
  document
    .getElementById("walkForm")
    .addEventListener("submit", function (event) {
      event.preventDefault();

      // Get user inputs for walk preferences
      const timesPerDay = document.getElementById("timesPerDay").value;
      const startTime = document.getElementById("startTime").value;
      const endTime = document.getElementById("endTime").value;

      let lat, lon;

      // Check if manual location is selected
      if (manualLocationCheckbox.checked) {
        const cityName = document.getElementById("cityName").value.trim();
        if (cityName === "") {
          alert("Bitte geben Sie einen Stadtname ein."); // Alert if city name is empty
          return;
        }

        // Fetch geocoding data for the entered city
        fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
            cityName
          )}&count=1&language=en&format=json`
        )
          .then((response) => response.json())
          .then((data) => {
            if (data.results.length > 0) {
              lat = data.results[0].latitude;
              lon = data.results[0].longitude;
              // Fetch weather data and display recommendations
              fetchAndDisplayData(lat, lon, timesPerDay, startTime, endTime);
            } else {
              alert(`Keine Koordinaten für die Stadt "${cityName}" gefunden.`); // Alert if no coordinates found
            }
          })
          .catch((error) => {
            console.error("Error fetching geocoding data:", error);
            alert("Es gab einen Fehler beim Abrufen der Koordinaten."); // Alert if there's an error fetching coordinates
          });

        return;
      }

      // Use geolocation API to get current position
      navigator.geolocation.getCurrentPosition((position) => {
        lat = position.coords.latitude;
        lon = position.coords.longitude;
        // Fetch weather data and display recommendations
        fetchAndDisplayData(lat, lon, timesPerDay, startTime, endTime);
      });
    });

  // Function to fetch and display weather data and recommendations
  function fetchAndDisplayData(lat, lon, timesPerDay, startTime, endTime) {
    const startTimeInMinutes = timeToMinutes(startTime);
    const endTimeInMinutes = timeToMinutes(endTime);

    // Fetch weather data for the given location
    fetchWeatherData(lat, lon).then((weatherData) => {
      // Get walk recommendations based on weather data
      const recommendations = getRecommendations(
        weatherData,
        timesPerDay,
        startTimeInMinutes,
        endTimeInMinutes
      );
      // Display recommendations and plot rain probability
      displayRecommendations(recommendations, weatherData);
      plotRainProbability(weatherData, recommendations);
    });
  }
});

// Function to convert time string (HH:MM) to minutes since midnight
function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Function to fetch weather data from API
function fetchWeatherData(lat, lon) {
  const currentDate = new Date().toISOString().split("T")[0];
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation&start=${currentDate}T00:00:00Z&end=${currentDate}T23:59:59Z`;

  return fetch(url)
    .then((response) => response.json())
    .then((data) => data.hourly.precipitation);
}

// Function to get walk recommendations based on weather data and user preferences
function getRecommendations(
  weatherData,
  timesPerDay,
  startTimeInMinutes,
  endTimeInMinutes
) {
  const interval = Math.floor(
    (endTimeInMinutes - startTimeInMinutes) / timesPerDay
  );
  const recommendations = [];

  for (let i = 0; i < timesPerDay; i++) {
    const timeSlotStart = startTimeInMinutes + i * interval;
    const timeSlotEnd = timeSlotStart + interval;

    let bestTime = timeSlotStart;
    let lowestPrecipitation = Number.MAX_VALUE;

    for (let time = timeSlotStart; time < timeSlotEnd; time += 60) {
      const hour = Math.floor(time / 60);
      const precipitation = weatherData[hour]; // No scaling needed
      if (precipitation < lowestPrecipitation) {
        lowestPrecipitation = precipitation;
        bestTime = time;
      }
    }

    recommendations.push({
      time: minutesToTime(bestTime),
      precipitation: lowestPrecipitation,
    });
  }

  return recommendations;
}

// Function to convert minutes since midnight to time string (HH:MM)
function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

// Function to display walk recommendations in the UI
function displayRecommendations(recommendations, weatherData) {
  const timeList = document.getElementById("timeList");
  timeList.innerHTML = "";

  recommendations.forEach(({ time, precipitation }) => {
    const listItem = document.createElement("li");
    listItem.textContent = `${time} -  🌧️ ${Math.round(precipitation * 100)}%`; // Display as percentage
    timeList.appendChild(listItem);
  });
}

// Function to plot rain probability on a chart
let chart = null;
function plotRainProbability(weatherData, recommendations) {
  const hoursOfDay = Array.from(
    { length: 24 },
    (_, index) => `${String(index).padStart(2, "0")}:00`
  );
  const rainProbabilities = weatherData.map(
    (precipitation) => precipitation * 100 // Convert to percentage
  );

  const recommendedTimes = recommendations.map(({ time }) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours;
  });

  const ctx = document.getElementById("rainChart").getContext("2d");

  if (chart) {
    chart.destroy(); // Destroy previous chart if exists
  }

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: hoursOfDay,
      datasets: [
        {
          label: "Regenwahrscheinlichkeit (%)",
          data: rainProbabilities,
          backgroundColor: "rgba(75, 192, 192, 0.2)",
          borderColor: "rgba(75, 192, 192, 1)",
          borderWidth: 1,
          tension: 0.1,
          fill: true,
        },
      ],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Regenwahrscheinlichkeit (%)",
          },
        },
        x: {
          title: {
            display: true,
            text: "Stunde des Tages",
          },
          ticks: {
            autoSkip: true,
            maxTicksLimit: 24,
          },
        },
      },
    },
  });

  // Highlight recommended times on the chart
  recommendedTimes.forEach((hour) => {
    const hourIndex = hoursOfDay.findIndex((label) =>
      label.startsWith(`${String(hour).padStart(2, "0")}`)
    );
    if (hourIndex !== -1) {
      chart.data.datasets.forEach((dataset) => {
        if (!dataset.pointBackgroundColor) {
          dataset.pointBackgroundColor = new Array(hoursOfDay.length).fill(
            null
          );
          dataset.pointBorderColor = new Array(hoursOfDay.length).fill(null);
          dataset.pointBorderWidth = new Array(hoursOfDay.length).fill(null);
          dataset.pointRadius = new Array(hoursOfDay.length).fill(null);
        }

        dataset.pointBackgroundColor[hourIndex] = "rgba(255, 99, 132, 1)";
        dataset.pointBorderColor[hourIndex] = "rgba(255, 99, 132, 1)";
        dataset.pointBorderWidth[hourIndex] = 2;
        dataset.pointRadius[hourIndex] = 5;
        dataset.data[hourIndex] =
          dataset.data[hourIndex] || rainProbabilities[hourIndex];
      });
    }
  });

  chart.update();
}
