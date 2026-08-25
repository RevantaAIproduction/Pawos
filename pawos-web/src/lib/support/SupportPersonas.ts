/**
 * Centralized pool of fictional Indian-style support persona names for PawOS AI Support.
 * One persona is assigned per support conversation session.
 * Different conversations may receive different personas, but the same conversation
 * retains the same persona throughout the session.
 */

export const SUPPORT_PERSONA_NAMES = [
  "Sai",
  "Sujith",
  "Likitha",
  "Tharun",
  "Harika",
  "Shaheen",
  "Preeti",
  "Arjun",
  "Divya",
  "Rohan",
  "Anika",
  "Karan",
  "Neha",
  "Vikram",
  "Ananya",
  "Ajay",
  "Priya",
  "Nikhil",
  "Ravi",
  "Pooja",
  "Harsh",
  "Anjali",
  "Aditya",
  "Shreya",
  "Rahul",
  "Diya",
  "Akshay",
  "Navya",
  "Deepak",
  "Isha",
  "Sameer",
  "Zara",
  "Varun",
  "Meera",
  "Sid",
  "Yasmin",
  "Aryan",
  "Pari",
  "Sunny",
  "Saira",
  "Ishan",
  "Leela",
  "Mohan",
  "Saranya",
  "Arun",
  "Nisha",
  "Vikrant",
  "Sakshi",
  "Sandeep",
  "Aditi",
  "Rajesh",
  "Simran",
  "Suresh",
  "Trisha",
  "Ashok",
  "Riya",
  "Kumar",
  "Kavya",
  "Neeraj",
  "Swara",
  "Ashish",
  "Anjum",
  "Sanjay",
  "Gina",
  "Pramod",
  "Heera",
  "Vishal",
  "Ina",
  "Mahesh",
  "Jessie",
  "Naresh",
  "Kavi",
  "Kailash",
  "Leena",
  "Manoj",
  "Laxmi",
  "Pranav",
  "Madhuri",
  "Aarav",
  "Malini",
  "Kabir",
  "Munni",
  "Rishi",
  "Nancy",
  "Sampath",
  "Naina",
  "Sanjit",
  "Nandini",
  "Tej",
  "Opal",
  "Udesh",
  "Priyanka",
  "Vedant",
  "Radhika",
  "Wali",
  "Sana",
  "Yasir",
  "Sasha",
  "Zain",
  "Thara",
  "Zain",
] as const;

export type SupportPersonaName = (typeof SUPPORT_PERSONA_NAMES)[number];

/**
 * Get a deterministic but pseudo-random persona for a user/conversation.
 * Uses userId + conversationId to ensure same conversation always gets same persona,
 * but different conversations get varied personas.
 */
export function assignPersonaForConversation(userId: string, conversationId: string): SupportPersonaName {
  const combined = `${userId}:${conversationId}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  const index = Math.abs(hash) % SUPPORT_PERSONA_NAMES.length;
  return SUPPORT_PERSONA_NAMES[index]!;
}

export function getPersonaGreeting(personaName: SupportPersonaName): string {
  return `Hi, I'm ${personaName}. I've reviewed your request. Just give me a minute and I'll check this for you.`;
}
