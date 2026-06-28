const businessConfig = {
  businessName: "Bella Roma",
  businessType: "Italian restaurant",

  greeting:
    "Hello, welcome to Bella Roma. Would you like to make a booking, ask about the menu, or something else?",

  tone:
    "Friendly, natural, professional London restaurant receptionist. Not robotic, not overly posh.",

  address: "123 High Road, Finchley, London",

  phoneNumber: "020 0000 0000",

  openingHours: {
    monday: "12:00pm - 10:00pm",
    tuesday: "12:00pm - 10:00pm",
    wednesday: "12:00pm - 10:00pm",
    thursday: "12:00pm - 10:00pm",
    friday: "12:00pm - 11:00pm",
    saturday: "12:00pm - 11:00pm",
    sunday: "12:00pm - 8:00pm"
  },

  bookingSettings: {
    maxBookingsPerSlot: 4,
    bookingIntervalMinutes: 30,
    defaultBookingLengthMinutes: 90,
    earliestBookingTime: "12:00pm",
    latestBookingTime: "9:30pm"
  },

  menu: {
    starters: [
      "Garlic bread",
      "Bruschetta",
      "Calamari",
      "Caprese salad"
    ],
    mains: [
      "Margherita pizza",
      "Pepperoni pizza",
      "Spaghetti carbonara",
      "Lasagne",
      "Chicken Milanese",
      "Sea bass"
    ],
    desserts: [
      "Tiramisu",
      "Panna cotta",
      "Chocolate fondant"
    ],
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
    vegetarian: "Yes, we have vegetarian options including pizza, pasta, and salads.",
    vegan: "We have a few vegan options. The staff can confirm on arrival.",
    glutenFree: "We have some gluten-free options, but please mention this when booking.",
    delivery: "We currently offer collection, but not delivery.",
    takeaway: "Yes, takeaway is available.",
    wheelchairAccess: "Yes, the restaurant has wheelchair access."
  },

  fallback:
    "I'm sorry, I don't have that information right now, but the team can help you when you arrive."
};

export default businessConfig;
