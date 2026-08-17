const businessConfig = {
  businessName: "Piani Pizza",

  businessType: "pizza restaurant and takeaway",

  greeting: "Hello, welcome to Piani Pizza. How may I assist you today?",

  tone:
    "Warm, quick, natural British restaurant receptionist. Sound human, relaxed and efficient. Use short conversational sentences, answer direct questions immediately, and never sound robotic or scripted.",

  address: "233 Nether Street, West Finchley, London N3 1NT",

  phoneNumber: "020 8050 9616",

  website: "pizza4us.co.uk",

  ordering: {
    dineIn: true,
    pickup: true,
    delivery: true,
    websiteOrdersRecommended: true,
    note: "Piani says orders placed through its own website are offered at lower prices than third-party delivery platforms."
  },

  openingHours: {
    monday: "11:30am - 7:30pm",
    tuesday: "11:30am - 7:30pm",
    wednesday: "11:30am - 7:30pm",
    thursday: "11:30am - 7:30pm",
    friday: "11:30am - 8:00pm",
    saturday: "11:30am - 7:00pm",
    sunday: "Closed"
  },

  lastOrders: "30 minutes before closing",

  bookingSettings: {
    enabled: true,
    bookingIntervalMinutes: 30,
    defaultBookingLengthMinutes: 90,
    maxBookingsPerSlot: 4,
    maximumPartySize: 6,
    notificationPhoneNumber: "+447402767133",
    note: "The phone receptionist can take table reservation requests using the internal booking sheet. These capacity limits are internal operating defaults, not published Piani policies."
  },

  menuPriceNote:
    "Menu prices can vary between Piani's own website and third-party apps. The figures below are current public menu prices found online; if a caller asks about a promotion or exact checkout total, say prices may differ by ordering channel.",

  menu: {
    pizzaDeals: [
      "7-inch pizza - £4.99",
      "10-inch pizza - £7.99",
      "12-inch pizza - £11.99"
    ],
    lunchSpecials: [
      "Happy 7, 7-inch deep pan pizza - £7.99",
      "10-inch pizza plus a can - £8.99",
      "12-inch pizza plus a can - £12.99"
    ],
    classicPizzas: [
      "Margherita: 7-inch £6.00, 10-inch £7.99, 12-inch £12.99, 15-inch £16.99",
      "Vegetarian Classic: 7-inch £6.99, 10-inch £9.99, 12-inch £13.98, 15-inch £18.99",
      "Hawaiian: 7-inch £6.00, 10-inch £9.99, 12-inch £13.99, 15-inch £18.99",
      "American Hot: 7-inch £6.99, 10-inch £9.99, 12-inch £13.99, 15-inch £19.99",
      "Chicken Classic: 7-inch £6.99, 10-inch £9.99, 12-inch £13.99, 15-inch £18.99",
      "Pepperoni Plus: 7-inch £6.00, 10-inch £8.00, 12-inch £13.99, 15-inch £18.99",
      "BBQ Chicken: 7-inch £6.99, 10-inch £8.99, 12-inch £13.99, 15-inch £18.99",
      "Vegetarian Spinach: 7-inch £6.50, 10-inch £8.50, 12-inch £12.99, 15-inch £16.99",
      "Meaty Two: 7-inch £6.50, 10-inch £8.99, 12-inch £12.99, 15-inch £16.99",
      "Ham and Mushroom: 7-inch £7.99, 10-inch £8.50, 12-inch £12.99, 15-inch £16.99",
      "Meaty Plus: 7-inch £7.99, 10-inch £8.99, 12-inch £13.99, 15-inch £17.99",
      "Vegetarian Hot: 7-inch £6.99, 10-inch £8.99, 12-inch £13.99, 15-inch £17.99",
      "Pepperoni Hot: 7-inch £6.00, 10-inch £8.99, 12-inch £12.99, 15-inch £16.99",
      "Sujuk Pizza: 7-inch £6.99, 10-inch £8.99, 12-inch £12.99, 15-inch £17.99",
      "Custom Toppings, choose 4 toppings: 10-inch £9.00, 12-inch £13.99, 15-inch £17.99",
      "Four Cheese: 7-inch £6.50, 10-inch £7.50, 12-inch £11.00, 15-inch £14.99",
      "Peri Peri Chicken: 7-inch £6.00, 10-inch £7.50, 12-inch £11.00"
    ],
    comboDeals: [
      "Family Combo, 15-inch pizza plus choice of 2 sides - £25.99",
      "2's Deal, two pizzas - from £10.99",
      "Individual Plus, any 12-inch pizza, side and 2 cans - £19.99",
      "Individual Deal, any 10-inch pizza, side and a can - £14.99"
    ],
    burgers: [
      "Halal quarter-pounder beef burger with lettuce, tomatoes, fried onions, cheese and burger sauce - £5.99",
      "Crispy chicken strip burger with lettuce, mayo, fried onions and cheese - £4.99"
    ],
    sidesAndStarters: [
      "Loaded potato wedges with cheese and jalapeños - £4.99",
      "Garlic bread slices, 2 pieces - £1.50",
      "Garlic bread with cheese, 2 pieces - £2.50",
      "Wings and wedges combo - £9.99",
      "Chicken breast nuggets, 6 pieces - £4.99",
      "Onion rings, 6 pieces - £3.99",
      "Mozzarella sticks, 4 pieces - £3.99",
      "Potato wedges - £4.99",
      "Chips - £3.99",
      "BBQ chicken wings, 4 pieces - £5.99",
      "Spicy hot wings, 3 pieces - £1.99",
      "Special Piani salad - £4.98"
    ],
    dips: [
      "Garlic mayonnaise - £0.60",
      "Garlic and herb - £0.60",
      "Sour cream and chive - £0.60",
      "Ketchup dip pot - £0.40",
      "Chilli sauce dip - £0.50"
    ]
  },

  foodInformation: {
    halal: "Piani states that its products are made with fresh halal meat. Chicken, beef and sujuk toppings are listed as halal.",
    dough: "The dough is made fresh on site with no preservatives, no added sugar, no milk and no improver.",
    fryers: "Piani says it uses two separate fryers to help prevent contamination and uses rapeseed oil for cooking and frying.",
    vegetarian: "There are several vegetarian pizzas including Vegetarian Classic, Vegetarian Spinach and Vegetarian Hot.",
    allergens: "For allergies or cross-contamination questions, do not guess. Advise the caller to speak directly with staff before ordering."
  },

  commonQuestions: {
    location: "Piani Pizza is at 233 Nether Street, West Finchley, London N3 1NT.",
    phone: "The phone number is 020 8050 9616.",
    delivery: "Yes, Piani offers delivery.",
    pickup: "Yes, collection is available.",
    dineIn: "Yes, dine-in is available.",
    ordering: "Customers can order through Piani's own website, as well as Uber Eats and Deliveroo. Piani says its own website offers lower prices.",
    halal: "Yes. Piani states that its products are made with fresh halal meat.",
    lastOrders: "Last orders are 30 minutes before closing.",
    sunday: "Piani is closed on Sundays.",
    reservations: "Yes, I can take a table reservation request for you."
  },

  fallback:
    "I don't have that detail confirmed, but I can help with the menu, opening times, address, orders or a reservation."
};

export default businessConfig;
