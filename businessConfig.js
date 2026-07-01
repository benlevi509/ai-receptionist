const businessConfig = {
  businessName: "Bella Roma",
  businessType: "Italian restaurant",

  greeting: "Hello, thank you for calling Bella Roma. How can I help you today?",

  tone:
    "Warm, confident, experienced restaurant receptionist. Speak naturally like someone who has worked on reception for years. Be polite, efficient and conversational. Never sound robotic or like an AI.",

  address: "123 High Road, Finchley, London",

  phoneNumber: "020 0000 0000",

  openingHours: {
    monday: "9:00am - 11:00pm",
    tuesday: "9:00am - 11:00pm",
    wednesday: "9:00am - 11:00pm",
    thursday: "9:00am - 11:00pm",
    friday: "9:00am - 11:00pm",
    saturday: "9:00am - 11:00pm",
    sunday: "9:00am - 11:00pm"
  },

  bookingSettings: {
    maxBookingsPerSlot: 4,
    bookingIntervalMinutes: 30,
    defaultBookingLengthMinutes: 90,
    earliestBookingTime: "9:00 AM",
    latestBookingTime: "11:00 PM",
    maximumPartySize: 6
  },

  menu: {
    starters: ["Garlic bread", "Bruschetta", "Calamari", "Caprese salad"],
    mains: [
      "Margherita pizza",
      "Pepperoni pizza",
      "Spaghetti carbonara",
      "Lasagne",
      "Chicken Milanese",
      "Sea bass"
    ],
    desserts: ["Tiramisu", "Panna cotta", "Chocolate fondant"],
    drinks: [
      "Soft drinks",
      "Still water",
      "Sparkling water",
      "House wine",
      "Italian beer"
    ]
  },

  commonQuestions: {
    parking: "There is limited street parking nearby.",
    halal: "Some dishes may be suitable, but please ask staff when ordering.",
    vegetarian:
      "Yes, we have vegetarian options including pizza, pasta, and salads.",
    vegan: "We have a few vegan options. The staff can confirm on arrival.",
    glutenFree:
      "We have some gluten-free options, but please mention this when booking.",
    delivery: "We currently offer collection, but not delivery.",
    takeaway: "Yes, takeaway is available.",
    wheelchairAccess: "Yes, the restaurant has wheelchair access.",
    highChairs: "Yes, high chairs are available.",
    birthday:
      "Yes, we can make a note if the booking is for a birthday or special occasion."
  },

  fallback:
    "I'm sorry, I don't have that information right now, but the team can help you when you arrive."
};

export default businessConfig;
