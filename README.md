# Atria -- Safe Transportation

![logo](atrialogo.png)

To start the app, first clone this repository. Insert the .env file with your MAPBOX_TOKEN, MAPBOX_PUBLIC_TOKEN, PORT, JWT_KEY, and MONGO_URI. Insert the annotatedcrime.csv and lights.geojson file in the parent directory. In one terminal, run the following commands:

```
cd frontend
npx expo start
```

In another terminal, run the following commands:

```
cd backend
node server.js
```

All interactions begin with the following user authentication steps.
1) Search for the launched frontend in your web browser
2) Click on 'Create Account'
3) Enter your credentials, following restrictions on username and password length
4) Click 'Create Account' at the bottom to be redirected to the 'Login' page
5) Login with the newly created credentials

## Interaction 1: Default Routing
The first interaction sequence allows users to navigate without setting any personal preferences on travel criteria

1) Currently, you are on the settings page. Either click 'Start a Route' on the settings page or click on 'Navigate' from the bottom navigation bar to enter the navigation page
2) Enter your start and end locations, making use of the suggested routes if applicable. These locations must be restricted to the general area from Santa Barbara to Irvine
3) After the mapping has been completed, there should be rideshare, driving, and bus route cards with default scores given. Click on a route card to see that route highlighted on the map.
4) To learn more about a route, click on the 'Details' button on that specific route's card.
5) Once on the details page, toggle between lighting, crime, and cleanliness at the top to see how the severity in these travel criteria vary throughout your selected route. Click the back arrow in the upper left when you are done.
6) Press 'Go' to choose a route and save it as a route you have taken in your profile.

## Interaction 2: Personalized Routing
The second interaction sequence allows users to navigate based on their personal preferences towards the different travel criteria supported by this system.

1) Click on 'Settings' from the bottom navigation bar to enter the settings page.
2) Scroll down to the 'Your Travel Preferences' section. Click on either 'Slider' or 'Rank' to choose the method in which you will convey your travel preferences. We do not recommend switching between the two options.
3) If you have chosen slider, move the slider for each travel criteria, where 0 means you do not care at all about this criteria and 20 means it is your ride or die criteria.
4) If you have chosen rank, click the up and down arrows attached at the rightmost end of each card to move the cards.
5) When you are done adjusting your preferences, click on 'Save Preferences' at the bottom.
6) From here, you can continue from Step 1 of Interaction 1. At any point in time, you can adjust your preferences by following steps 1-4 here.

## Interaction 3: Community Information
The third interaction sequence allows users to read and post real-time alerts and information that our static datasets would not provide, such as theft or assault.

1) Click on 'Community Alerts' from the bottom navigation bar.
2) Search through the community alerts by location, category, or severity.
3) If the information you would like to post is not covered currently, click on 'Add an Alert' in the upper right.
4) Fill out information for the date, location, category, severity, and optionally, description. Click 'Save' at the bottom when you are done.
5) To provide extra information about a specific route you have taken, click on 'Settings' from the bottom navigation bar.
6) In the 'Your Recent Routes' section, search by location or date range. Click 'Feedback' on the route card you would like to give feedback on.
7) Score the travel criteria from 0 to 20 using a slider and optionally, add extra information in the description. Click 'Save' when you are done.
