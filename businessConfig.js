const businessConfig = {
  businessName: "the business",
  businessType: "business",
  greeting: "Hello, how may I assist you today?",
  tone: "Warm, quick, natural British receptionist. Sound human, relaxed and efficient. Use short conversational sentences, answer direct questions immediately, and never sound robotic or scripted.",
  address: "",
  phoneNumber: "",
  website: "",
  ordering: {
    dineIn: false,
    pickup: false,
    delivery: false,
    websiteOrdersRecommended: false,
    note: ""
  },
  openingHours: {},
  lastOrders: "",
  bookingSettings: {
    enabled: true,
    bookingIntervalMinutes: 30,
    defaultBookingLengthMinutes: 90,
    maxBookingsPerSlot: 4,
    maximumPartySize: 6,
    notificationPhoneNumber: "",
    note: ""
  },
  menuPriceNote: "",
  menu: {},
  foodInformation: {},
  commonQuestions: {},
  fallback: "I don't have that detail confirmed."
};

export default businessConfig;
