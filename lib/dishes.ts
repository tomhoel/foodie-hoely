export interface Dish {
  name: string;
  nativeName?: string;
  cuisine: string;
  category: string;
  tags: string;
  image: string | null;
}

/** Dishes with real TheMealDB images, deduplicated by URL */
export function getFeaturedDishes(count = 4): Dish[] {
  const seen = new Set<string>();
  return dishes.filter((d) => {
    if (!d.image?.startsWith('http') || seen.has(d.image)) return false;
    seen.add(d.image);
    return true;
  }).slice(0, count);
}

export const CUISINE_COLORS: Record<string, string> = {
  Thai: '#E8590C',
  Korean: '#D14E0A',
  Japanese: '#B84500',
  Vietnamese: '#059669',
  Chinese: '#C44408',
  Indian: '#D97706',
  Indonesian: '#9A3412',
  default: '#9A3412',
};

const T = 'https://www.themealdb.com/images/media/meals/';

export const dishes: Dish[] = [
  // ═══ THAI — Curries (แกง) ═══
  { name: 'Green Curry', nativeName: 'แกงเขียวหวาน', cuisine: 'Thai', category: 'Curry', tags: 'gaeng khiao wan,coconut,spicy,green chili,chicken', image: T + 'sstssx1487349585.jpg' },
  { name: 'Gaeng Khiao Wan', nativeName: 'แกงเขียวหวาน', cuisine: 'Thai', category: 'Curry', tags: 'green curry,coconut,thai eggplant,basil', image: T + 'sstssx1487349585.jpg' },
  { name: 'Red Curry', nativeName: 'แกงเผ็ด', cuisine: 'Thai', category: 'Curry', tags: 'gaeng phet,coconut,spicy,red chili,bamboo', image: '/img/red-curry.jpg' },
  { name: 'Yellow Curry', nativeName: 'แกงเหลือง', cuisine: 'Thai', category: 'Curry', tags: 'gaeng lueng,coconut,mild,turmeric,potato', image: '/img/yellow-curry.jpg' },
  { name: 'Massaman Curry', nativeName: 'แกงมัสมั่น', cuisine: 'Thai', category: 'Curry', tags: 'gaeng massaman,peanuts,mild,potato,cinnamon', image: T + 'tvttqv1504640475.jpg' },
  { name: 'Panang Curry', nativeName: 'แกงพะแนง', cuisine: 'Thai', category: 'Curry', tags: 'panaeng,thick,creamy,kaffir lime,peanut', image: T + '0dhtwr1763371444.jpg' },
  { name: 'Khao Soi', nativeName: 'ข้าวซอย', cuisine: 'Thai', category: 'Curry Noodles', tags: 'northern,chiang mai,coconut,egg noodles,crispy', image: T + '118oj61763423896.jpg' },
  { name: 'Gaeng Som', nativeName: 'แกงส้ม', cuisine: 'Thai', category: 'Curry', tags: 'sour curry,southern,fish,turmeric,tamarind', image: '/img/gaeng-som.jpg' },
  { name: 'Gaeng Hung Lay', nativeName: 'แกงฮังเล', cuisine: 'Thai', category: 'Curry', tags: 'northern,pork belly,burmese,ginger,tamarind', image: '/img/gaeng-hung-lay.jpg' },
  { name: 'Gaeng Pa', nativeName: 'แกงป่า', cuisine: 'Thai', category: 'Curry', tags: 'jungle curry,spicy,no coconut,wild herbs,peppercorn', image: '/img/gaeng-pa.jpg' },
  { name: 'Gaeng Tai Pla', nativeName: 'แกงไตปลา', cuisine: 'Thai', category: 'Curry', tags: 'southern,fish organs,fermented,spicy,intense', image: '/img/gaeng-tai-pla.jpg' },
  { name: 'Gaeng Liang', nativeName: 'แกงเลียง', cuisine: 'Thai', category: 'Curry', tags: 'mixed vegetable,shrimp paste,pepper,healthy,light', image: '/img/gaeng-liang.jpg' },
  { name: 'Chu Chee', nativeName: 'ฉู่ฉี่', cuisine: 'Thai', category: 'Curry', tags: 'thick curry,fish,kaffir lime,no soup,red curry paste', image: '/img/chu-chee.jpg' },
  { name: 'Gaeng Kari', nativeName: 'แกงกะหรี่', cuisine: 'Thai', category: 'Curry', tags: 'yellow curry,mild,potato,onion,chicken', image: T + 'snmtd61763426568.jpg' },
  { name: 'Gaeng Jued', nativeName: 'แกงจืด', cuisine: 'Thai', category: 'Soup', tags: 'clear soup,tofu,glass noodles,mild,pork', image: '/img/gaeng-jued.jpg' },
  { name: 'Panaeng Neua', nativeName: 'พะแนงเนื้อ', cuisine: 'Thai', category: 'Curry', tags: 'panang beef,thick,creamy,kaffir lime', image: '/img/panaeng-neua.jpg' },

  // ═══ THAI — Soups (ต้ม) ═══
  { name: 'Tom Yum Goong', nativeName: 'ต้มยำกุ้ง', cuisine: 'Thai', category: 'Soup', tags: 'tom yum,shrimp,spicy,sour,lemongrass,galangal', image: T + 'l50vz41763422681.jpg' },
  { name: 'Tom Yum Gai', nativeName: 'ต้มยำไก่', cuisine: 'Thai', category: 'Soup', tags: 'tom yum,chicken,spicy,sour,lemongrass', image: '/img/tom-yum-gai.jpg' },
  { name: 'Tom Kha Gai', nativeName: 'ต้มข่าไก่', cuisine: 'Thai', category: 'Soup', tags: 'coconut,chicken,galangal,creamy,mushroom', image: T + 'ol2xxt1763582263.jpg' },
  { name: 'Khao Tom', nativeName: 'ข้าวต้ม', cuisine: 'Thai', category: 'Soup', tags: 'rice soup,breakfast,pork,ginger,comfort food', image: '/img/khao-tom.jpg' },
  { name: 'Tom Saap', nativeName: 'ต้มแซ่บ', cuisine: 'Thai', category: 'Soup', tags: 'isaan,spicy,sour,pork ribs,northeastern', image: '/img/tom-saap.jpg' },
  { name: 'Tom Jued Woon Sen', nativeName: 'ต้มจืดวุ้นเส้น', cuisine: 'Thai', category: 'Soup', tags: 'clear soup,glass noodles,pork,mild', image: '/img/tom-jued-woon-sen.jpg' },

  // ═══ THAI — Noodles (ก๋วยเตี๋ยว) ═══
  { name: 'Pad Thai', nativeName: 'ผัดไทย', cuisine: 'Thai', category: 'Noodles', tags: 'rice noodles,tamarind,peanuts,street food,shrimp,egg', image: T + 'rg9ze01763479093.jpg' },
  { name: 'Pad See Ew', nativeName: 'ผัดซีอิ๊ว', cuisine: 'Thai', category: 'Noodles', tags: 'wide noodles,soy sauce,chinese broccoli,stir-fry', image: T + 'uuuspp1468263334.jpg' },
  { name: 'Pad Woon Sen', nativeName: 'ผัดวุ้นเส้น', cuisine: 'Thai', category: 'Noodles', tags: 'glass noodles,stir-fry,egg,vegetables', image: '/img/pad-woon-sen.jpg' },
  { name: 'Drunken Noodles', nativeName: 'ผัดขี้เมา', cuisine: 'Thai', category: 'Noodles', tags: 'pad kee mao,spicy,basil,wide noodles,chili', image: T + '2wx8cm1763373419.jpg' },
  { name: 'Pad Kee Mao', nativeName: 'ผัดขี้เมา', cuisine: 'Thai', category: 'Noodles', tags: 'drunken noodles,spicy,basil,wide noodles', image: T + '2wx8cm1763373419.jpg' },
  { name: 'Guay Tiew', nativeName: 'ก๋วยเตี๋ยว', cuisine: 'Thai', category: 'Noodles', tags: 'noodle soup,street food,pork,beef,chicken,broth', image: '/img/guay-tiew.jpg' },
  { name: 'Guay Tiew Reua', nativeName: 'ก๋วยเตี๋ยวเรือ', cuisine: 'Thai', category: 'Noodles', tags: 'boat noodles,dark broth,pork blood,intense,street food', image: '/img/guay-tiew-reua.jpg' },
  { name: 'Kuay Chap', nativeName: 'ก๋วยจั๊บ', cuisine: 'Thai', category: 'Noodles', tags: 'rolled noodles,pork,five spice,offal,broth', image: '/img/kuay-chap.jpg' },
  { name: 'Yen Ta Fo', nativeName: 'เย็นตาโฟ', cuisine: 'Thai', category: 'Noodles', tags: 'pink noodles,fermented tofu,seafood,sweet,sour', image: '/img/yen-ta-fo.jpg' },
  { name: 'Bamee', nativeName: 'บะหมี่', cuisine: 'Thai', category: 'Noodles', tags: 'egg noodles,wonton,pork,roast duck', image: '/img/bamee.jpg' },
  { name: 'Rad Na', nativeName: 'ราดหน้า', cuisine: 'Thai', category: 'Noodles', tags: 'gravy noodles,wide noodles,broccoli,pork,thick sauce', image: '/img/rad-na.jpg' },
  { name: 'Khanom Jeen', nativeName: 'ขนมจีน', cuisine: 'Thai', category: 'Noodles', tags: 'rice noodles,curry,fermented,fish curry,green curry', image: '/img/khanom-jeen.jpg' },
  { name: 'Khanom Jeen Nam Ya', nativeName: 'ขนมจีนน้ำยา', cuisine: 'Thai', category: 'Noodles', tags: 'rice noodles,fish curry,southern,spicy', image: '/img/khanom-jeen-nam-ya.jpg' },
  { name: 'Sukiyaki Thai', nativeName: 'สุกี้ไทย', cuisine: 'Thai', category: 'Noodles', tags: 'glass noodles,hot pot,egg,sweet sauce,seafood', image: '/img/sukiyaki-thai.jpg' },
  { name: 'Mee Krob', nativeName: 'หมี่กรอบ', cuisine: 'Thai', category: 'Noodles', tags: 'crispy noodles,sweet,tangy,shrimp,palm sugar', image: '/img/mee-krob.jpg' },

  // ═══ THAI — Stir-fries (ผัด) ═══
  { name: 'Pad Kra Pao', nativeName: 'ผัดกะเพรา', cuisine: 'Thai', category: 'Stir-fry', tags: 'holy basil,street food,chili,minced pork,fried egg', image: T + 'el64dy1763483009.jpg' },
  { name: 'Pad Prik King', nativeName: 'ผัดพริกขิง', cuisine: 'Thai', category: 'Stir-fry', tags: 'red curry paste,green beans,kaffir lime,dry curry', image: '/img/pad-prik-king.jpg' },
  { name: 'Pad Cashew Chicken', nativeName: 'ไก่ผัดเม็ดมะม่วง', cuisine: 'Thai', category: 'Stir-fry', tags: 'gai pad met mamuang,cashew nuts,dried chili,sweet', image: '/img/pad-cashew-chicken.jpg' },
  { name: 'Pad Prik Gaeng', nativeName: 'ผัดพริกแกง', cuisine: 'Thai', category: 'Stir-fry', tags: 'curry paste stir-fry,pork,green beans,spicy', image: '/img/pad-prik-gaeng.jpg' },
  { name: 'Pad Phak Bung', nativeName: 'ผัดผักบุ้ง', cuisine: 'Thai', category: 'Stir-fry', tags: 'morning glory,fire wok,garlic,chili,street food', image: '/img/pad-phak-bung.jpg' },
  { name: 'Pad Phak Ruam', nativeName: 'ผัดผักรวม', cuisine: 'Thai', category: 'Stir-fry', tags: 'mixed vegetables,oyster sauce,garlic,healthy', image: '/img/pad-phak-ruam.jpg' },
  { name: 'Kai Pad Prik', nativeName: 'ไก่ผัดพริก', cuisine: 'Thai', category: 'Stir-fry', tags: 'chicken,chili,bell pepper,onion', image: '/img/kai-pad-prik.jpg' },
  { name: 'Neua Pad Prik', nativeName: 'เนื้อผัดพริก', cuisine: 'Thai', category: 'Stir-fry', tags: 'beef,chili,basil,oyster sauce', image: '/img/neua-pad-prik.jpg' },
  { name: 'Pla Rad Prik', nativeName: 'ปลาราดพริก', cuisine: 'Thai', category: 'Stir-fry', tags: 'fried fish,chili sauce,sweet,sour,crispy', image: '/img/pla-rad-prik.jpg' },

  // ═══ THAI — Rice dishes (ข้าว) ═══
  { name: 'Khao Pad', nativeName: 'ข้าวผัด', cuisine: 'Thai', category: 'Fried Rice', tags: 'fried rice,egg,quick,garlic,onion', image: T + 'hblwvg1763478203.jpg' },
  { name: 'Khao Pad Gai', nativeName: 'ข้าวผัดไก่', cuisine: 'Thai', category: 'Fried Rice', tags: 'chicken fried rice,egg,garlic,soy sauce', image: '/img/khao-pad-gai.jpg' },
  { name: 'Khao Pad Goong', nativeName: 'ข้าวผัดกุ้ง', cuisine: 'Thai', category: 'Fried Rice', tags: 'shrimp fried rice,egg,garlic', image: '/img/khao-pad-goong.jpg' },
  { name: 'Khao Pad Sapparod', nativeName: 'ข้าวผัดสับปะรด', cuisine: 'Thai', category: 'Fried Rice', tags: 'pineapple fried rice,curry powder,raisins,cashews', image: '/img/khao-pad-sapparod.jpg' },
  { name: 'Khao Man Gai', nativeName: 'ข้าวมันไก่', cuisine: 'Thai', category: 'Rice', tags: 'chicken rice,hainanese,poached chicken,ginger sauce,street food', image: '/img/khao-man-gai.jpg' },
  { name: 'Khao Moo Daeng', nativeName: 'ข้าวหมูแดง', cuisine: 'Thai', category: 'Rice', tags: 'red pork rice,bbq pork,sweet sauce,street food', image: '/img/khao-moo-daeng.jpg' },
  { name: 'Khao Kha Moo', nativeName: 'ข้าวขาหมู', cuisine: 'Thai', category: 'Rice', tags: 'braised pork leg,five spice,egg,pickled mustard,street food', image: '/img/khao-kha-moo.jpg' },
  { name: 'Khao Na Ped', nativeName: 'ข้าวหน้าเป็ด', cuisine: 'Thai', category: 'Rice', tags: 'roast duck rice,gravy,chinese-thai', image: '/img/khao-na-ped.jpg' },
  { name: 'Khao Mok Gai', nativeName: 'ข้าวหมกไก่', cuisine: 'Thai', category: 'Rice', tags: 'thai biryani,chicken,turmeric,spiced rice,southern', image: '/img/khao-mok-gai.jpg' },
  { name: 'Khao Kluk Kapi', nativeName: 'ข้าวคลุกกะปิ', cuisine: 'Thai', category: 'Rice', tags: 'shrimp paste rice,sweet pork,green mango,dried shrimp', image: '/img/khao-kluk-kapi.jpg' },
  { name: 'Khao Niao', nativeName: 'ข้าวเหนียว', cuisine: 'Thai', category: 'Rice', tags: 'sticky rice,isaan,glutinous rice,northeastern', image: '/img/khao-niao.jpg' },

  // ═══ THAI — Salads (ยำ/ส้มตำ) ═══
  { name: 'Som Tam', nativeName: 'ส้มตำ', cuisine: 'Thai', category: 'Salad', tags: 'papaya salad,spicy,northeastern,isaan,lime,chili', image: '/img/som-tam.jpg' },
  { name: 'Som Tam Thai', nativeName: 'ส้มตำไทย', cuisine: 'Thai', category: 'Salad', tags: 'papaya salad,peanuts,dried shrimp,sweet', image: '/img/som-tam-thai.jpg' },
  { name: 'Som Tam Poo Pla Ra', nativeName: 'ส้มตำปูปลาร้า', cuisine: 'Thai', category: 'Salad', tags: 'papaya salad,fermented fish,crab,isaan,intense', image: '/img/som-tam-poo-pla-ra.jpg' },
  { name: 'Larb', nativeName: 'ลาบ', cuisine: 'Thai', category: 'Salad', tags: 'minced meat,northeastern,isaan,lime,mint,toasted rice', image: '/img/larb.jpg' },
  { name: 'Larb Moo', nativeName: 'ลาบหมู', cuisine: 'Thai', category: 'Salad', tags: 'minced pork,isaan,lime,chili,herbs', image: '/img/larb-moo.jpg' },
  { name: 'Larb Gai', nativeName: 'ลาบไก่', cuisine: 'Thai', category: 'Salad', tags: 'minced chicken,isaan,lime,chili,herbs', image: '/img/larb-gai.jpg' },
  { name: 'Nam Tok', nativeName: 'น้ำตก', cuisine: 'Thai', category: 'Salad', tags: 'waterfall beef,grilled,northeastern,lime,toasted rice', image: '/img/nam-tok.jpg' },
  { name: 'Yam Woon Sen', nativeName: 'ยำวุ้นเส้น', cuisine: 'Thai', category: 'Salad', tags: 'glass noodle salad,shrimp,spicy,lime,herbs', image: '/img/yam-woon-sen.jpg' },
  { name: 'Yam Talay', nativeName: 'ยำทะเล', cuisine: 'Thai', category: 'Salad', tags: 'seafood salad,spicy,lime,lemongrass,shrimp,squid', image: '/img/yam-talay.jpg' },
  { name: 'Yam Neua', nativeName: 'ยำเนื้อ', cuisine: 'Thai', category: 'Salad', tags: 'beef salad,spicy,lime,onion,herbs', image: '/img/yam-neua.jpg' },
  { name: 'Yam Pla Dook Foo', nativeName: 'ยำปลาดุกฟู', cuisine: 'Thai', category: 'Salad', tags: 'crispy catfish,green mango,spicy,fluffy', image: '/img/yam-pla-dook-foo.jpg' },
  { name: 'Yam Mamuang', nativeName: 'ยำมะม่วง', cuisine: 'Thai', category: 'Salad', tags: 'green mango salad,spicy,sweet,sour,cashew', image: '/img/yam-mamuang.jpg' },
  { name: 'Yam Khai Dao', nativeName: 'ยำไข่ดาว', cuisine: 'Thai', category: 'Salad', tags: 'fried egg salad,spicy,lime,onion', image: '/img/yam-khai-dao.jpg' },
  { name: 'Phla Goong', nativeName: 'พล่ากุ้ง', cuisine: 'Thai', category: 'Salad', tags: 'spicy shrimp salad,lemongrass,lime,herbs', image: '/img/phla-goong.jpg' },

  // ═══ THAI — Grilled (ย่าง/ปิ้ง) ═══
  { name: 'Gai Yang', nativeName: 'ไก่ย่าง', cuisine: 'Thai', category: 'Grilled', tags: 'grilled chicken,northeastern,isaan,street food,sticky rice', image: T + 'ittake1763586925.jpg' },
  { name: 'Moo Ping', nativeName: 'หมูปิ้ง', cuisine: 'Thai', category: 'Grilled', tags: 'grilled pork skewers,street food,sticky rice,sweet marinade', image: '/img/moo-ping.jpg' },
  { name: 'Satay', nativeName: 'สะเต๊ะ', cuisine: 'Thai', category: 'Grilled', tags: 'chicken satay,peanut sauce,skewers,turmeric,cucumber relish', image: '/img/satay.jpg' },
  { name: 'Kor Moo Yang', nativeName: 'คอหมูย่าง', cuisine: 'Thai', category: 'Grilled', tags: 'grilled pork neck,isaan,spicy dipping sauce,nam jim jaew', image: '/img/kor-moo-yang.jpg' },
  { name: 'Pla Pao', nativeName: 'ปลาเผา', cuisine: 'Thai', category: 'Grilled', tags: 'salt-crusted grilled fish,lemongrass,whole fish,street food', image: '/img/pla-pao.jpg' },
  { name: 'Sai Krok Isaan', nativeName: 'ไส้กรอกอีสาน', cuisine: 'Thai', category: 'Grilled', tags: 'fermented sausage,northeastern,sour,rice,pork', image: '/img/sai-krok-isaan.jpg' },
  { name: 'Suea Rong Hai', nativeName: 'เสือร้องไห้', cuisine: 'Thai', category: 'Grilled', tags: 'crying tiger,grilled beef,spicy dipping sauce,isaan', image: '/img/suea-rong-hai.jpg' },
  { name: 'Moo Satay', nativeName: 'หมูสะเต๊ะ', cuisine: 'Thai', category: 'Grilled', tags: 'pork satay,peanut sauce,skewers,turmeric', image: '/img/moo-satay.jpg' },

  // ═══ THAI — Fried & Street Food (ทอด) ═══
  { name: 'Tod Mun Pla', nativeName: 'ทอดมันปลา', cuisine: 'Thai', category: 'Appetizer', tags: 'fish cakes,curry paste,fried,kaffir lime,green beans', image: T + '6s3i3p1763488540.jpg' },
  { name: 'Kai Jeow', nativeName: 'ไข่เจียว', cuisine: 'Thai', category: 'Omelette', tags: 'thai omelette,egg,street food,quick,fish sauce', image: '/img/kai-jeow.jpg' },
  { name: 'Kai Jeow Moo Sap', nativeName: 'ไข่เจียวหมูสับ', cuisine: 'Thai', category: 'Omelette', tags: 'omelette,minced pork,street food', image: '/img/kai-jeow-moo-sap.jpg' },
  { name: 'Gai Tod', nativeName: 'ไก่ทอด', cuisine: 'Thai', category: 'Fried', tags: 'thai fried chicken,garlic,fish sauce,crispy,street food', image: '/img/gai-tod.jpg' },
  { name: 'Gai Tod Hat Yai', nativeName: 'ไก่ทอดหาดใหญ่', cuisine: 'Thai', category: 'Fried', tags: 'hat yai fried chicken,southern,turmeric,crispy shallots', image: '/img/gai-tod-hat-yai.jpg' },
  { name: 'Moo Tod Gratiem', nativeName: 'หมูทอดกระเทียม', cuisine: 'Thai', category: 'Fried', tags: 'fried pork,garlic,pepper,street food', image: '/img/moo-tod-gratiem.jpg' },
  { name: 'Poh Pia Tod', nativeName: 'ปอเปี๊ยะทอด', cuisine: 'Thai', category: 'Appetizer', tags: 'spring rolls,fried,crispy,pork,vegetables', image: '/img/poh-pia-tod.jpg' },
  { name: 'Poh Pia Sod', nativeName: 'ปอเปี๊ยะสด', cuisine: 'Thai', category: 'Appetizer', tags: 'fresh spring rolls,rice paper,shrimp,herbs,no fry', image: '/img/poh-pia-sod.jpg' },
  { name: 'Hoy Tod', nativeName: 'หอยทอด', cuisine: 'Thai', category: 'Street Food', tags: 'crispy mussel omelette,egg,starch,bean sprouts', image: '/img/hoy-tod.jpg' },
  { name: 'Look Chin', nativeName: 'ลูกชิ้น', cuisine: 'Thai', category: 'Street Food', tags: 'meatballs,fish balls,pork balls,skewers,street food', image: '/img/look-chin.jpg' },
  { name: 'Khanom Buang', nativeName: 'ขนมเบื้อง', cuisine: 'Thai', category: 'Street Food', tags: 'thai crepes,crispy,sweet,meringue,coconut', image: '/img/khanom-buang.jpg' },
  { name: 'Goong Sarong', nativeName: 'กุ้งซาหรง', cuisine: 'Thai', category: 'Appetizer', tags: 'shrimp wrapped in noodles,deep fried,crispy', image: '/img/goong-sarong.jpg' },
  { name: 'Thot Man Khao Pod', nativeName: 'ทอดมันข้าวโพด', cuisine: 'Thai', category: 'Appetizer', tags: 'corn cakes,fried,curry paste,sweet corn', image: '/img/thot-man-khao-pod.jpg' },

  // ═══ THAI — Dips & Sauces (น้ำพริก) ═══
  { name: 'Nam Prik Ong', nativeName: 'น้ำพริกอ่อง', cuisine: 'Thai', category: 'Dip', tags: 'northern,tomato chili dip,pork,served with vegetables', image: '/img/nam-prik-ong.jpg' },
  { name: 'Nam Prik Noom', nativeName: 'น้ำพริกหนุ่ม', cuisine: 'Thai', category: 'Dip', tags: 'northern,green chili dip,roasted,smoky', image: '/img/nam-prik-noom.jpg' },
  { name: 'Nam Jim Jaew', nativeName: 'น้ำจิ้มแจ่ว', cuisine: 'Thai', category: 'Dip', tags: 'isaan dipping sauce,chili,lime,toasted rice,fish sauce', image: '/img/nam-jim-jaew.jpg' },
  { name: 'Nam Prik Goong Siap', nativeName: 'น้ำพริกกุ้งเสียบ', cuisine: 'Thai', category: 'Dip', tags: 'dried shrimp dip,southern,spicy', image: '/img/nam-prik-goong-siap.jpg' },
  { name: 'Nam Prik Kapi', nativeName: 'น้ำพริกกะปิ', cuisine: 'Thai', category: 'Dip', tags: 'shrimp paste dip,chili,lime,served with fried mackerel', image: '/img/nam-prik-kapi.jpg' },
  { name: 'Lon Tao Jiaw', nativeName: 'หลนเต้าเจี้ยว', cuisine: 'Thai', category: 'Dip', tags: 'soybean dip,coconut milk,sweet,mild', image: '/img/lon-tao-jiaw.jpg' },

  // ═══ THAI — Other mains ═══
  { name: 'Kai Palo', nativeName: 'ไข่พะโล้', cuisine: 'Thai', category: 'Braised', tags: 'five spice eggs,pork,tofu,chinese-thai,star anise', image: '/img/kai-palo.jpg' },
  { name: 'Moo Hong', nativeName: 'หมูฮ้อง', cuisine: 'Thai', category: 'Braised', tags: 'southern braised pork,pepper,garlic,palm sugar,slow cooked', image: '/img/moo-hong.jpg' },
  { name: 'Pla Nueng Manao', nativeName: 'ปลานึ่งมะนาว', cuisine: 'Thai', category: 'Steamed', tags: 'steamed fish,lime,chili,garlic,sour,spicy', image: '/img/pla-nueng-manao.jpg' },
  { name: 'Pla Sam Rod', nativeName: 'ปลาสามรส', cuisine: 'Thai', category: 'Fried', tags: 'three flavored fish,sweet,sour,spicy,crispy', image: '/img/pla-sam-rod.jpg' },
  { name: 'Neua Toon', nativeName: 'เนื้อตุ๋น', cuisine: 'Thai', category: 'Braised', tags: 'braised beef,five spice,slow cooked,noodle soup', image: '/img/neua-toon.jpg' },
  { name: 'Ho Mok', nativeName: 'ห่อหมก', cuisine: 'Thai', category: 'Steamed', tags: 'fish curry custard,banana leaf,coconut,steamed', image: '/img/ho-mok.jpg' },
  { name: 'Pla Meuk Yang', nativeName: 'ปลาหมึกย่าง', cuisine: 'Thai', category: 'Grilled', tags: 'grilled squid,seafood,street food,dipping sauce', image: '/img/pla-meuk-yang.jpg' },

  // ═══ THAI — Desserts (ขนม) ═══
  { name: 'Kao Niao Mamuang', nativeName: 'ข้าวเหนียวมะม่วง', cuisine: 'Thai', category: 'Dessert', tags: 'mango sticky rice,coconut milk,sweet,iconic', image: '/img/kao-niao-mamuang.jpg' },
  { name: 'Tub Tim Grob', nativeName: 'ทับทิมกรอบ', cuisine: 'Thai', category: 'Dessert', tags: 'water chestnuts,red,coconut milk,ice,crunchy', image: '/img/tub-tim-grob.jpg' },
  { name: 'Bua Loi', nativeName: 'บัวลอย', cuisine: 'Thai', category: 'Dessert', tags: 'rice balls,coconut cream,warm,sweet,taro,pandan', image: '/img/bua-loi.jpg' },
  { name: 'Khanom Krok', nativeName: 'ขนมครก', cuisine: 'Thai', category: 'Dessert', tags: 'coconut pancakes,crispy,sweet,street food,pandan', image: '/img/khanom-krok.jpg' },
  { name: 'Sangkaya Fak Thong', nativeName: 'สังขยาฟักทอง', cuisine: 'Thai', category: 'Dessert', tags: 'pumpkin custard,coconut,egg,steamed,sweet', image: '/img/sangkaya-fak-thong.jpg' },
  { name: 'Lod Chong', nativeName: 'ลอดช่อง', cuisine: 'Thai', category: 'Dessert', tags: 'pandan noodles,coconut milk,palm sugar,green,iced', image: '/img/lod-chong.jpg' },
  { name: 'Foi Thong', nativeName: 'ฝอยทอง', cuisine: 'Thai', category: 'Dessert', tags: 'golden threads,egg yolk,sugar syrup,portuguese origin', image: '/img/foi-thong.jpg' },
  { name: 'Kluay Buat Chi', nativeName: 'กล้วยบวชชี', cuisine: 'Thai', category: 'Dessert', tags: 'bananas in coconut milk,warm,sweet,simple', image: '/img/kluay-buat-chi.jpg' },
  { name: 'Khanom Tuay', nativeName: 'ขนมถ้วย', cuisine: 'Thai', category: 'Dessert', tags: 'coconut custard cups,pandan,two layers,steamed', image: '/img/khanom-tuay.jpg' },
  { name: 'Itim Kati', nativeName: 'ไอติมกะทิ', cuisine: 'Thai', category: 'Dessert', tags: 'coconut ice cream,street food,toppings,peanuts,sweet corn', image: '/img/itim-kati.jpg' },
  { name: 'Khanom Tan', nativeName: 'ขนมตาล', cuisine: 'Thai', category: 'Dessert', tags: 'palm sugar cakes,steamed,fluffy,traditional', image: '/img/khanom-tan.jpg' },
  { name: 'Khao Lam', nativeName: 'ข้าวหลาม', cuisine: 'Thai', category: 'Dessert', tags: 'bamboo sticky rice,coconut,sweet,grilled,black beans', image: '/img/khao-lam.jpg' },
  { name: 'Roti', nativeName: 'โรตี', cuisine: 'Thai', category: 'Dessert', tags: 'thai roti,street food,banana,egg,condensed milk,crispy', image: '/img/roti.jpg' },

  // ═══ Korean ═══
  { name: 'Bibimbap', nativeName: '비빔밥', cuisine: 'Korean', category: 'Rice Bowl', tags: 'vegetables,gochujang,egg', image: '/img/bibimbap.jpg' },
  { name: 'Kimchi Jjigae', nativeName: '김치찌개', cuisine: 'Korean', category: 'Stew', tags: 'kimchi,tofu,pork', image: '/img/kimchi-jjigae.jpg' },
  { name: 'Bulgogi', nativeName: '불고기', cuisine: 'Korean', category: 'Grilled', tags: 'beef,marinated,sesame', image: '/img/bulgogi.jpg' },
  { name: 'Japchae', nativeName: '잡채', cuisine: 'Korean', category: 'Noodles', tags: 'glass noodles,sweet,vegetables', image: '/img/japchae.jpg' },
  { name: 'Tteokbokki', nativeName: '떡볶이', cuisine: 'Korean', category: 'Street Food', tags: 'rice cakes,spicy,gochujang', image: '/img/tteokbokki.jpg' },
  { name: 'Korean Fried Chicken', nativeName: '양념치킨', cuisine: 'Korean', category: 'Fried', tags: 'chicken,crispy,gochujang', image: '/img/korean-fried-chicken.jpg' },
  { name: 'Sundubu Jjigae', nativeName: '순두부찌개', cuisine: 'Korean', category: 'Stew', tags: 'soft tofu,spicy,egg', image: '/img/sundubu-jjigae.jpg' },

  // ═══ Vietnamese ═══
  { name: 'Pho', nativeName: 'Ph\u1EDF', cuisine: 'Vietnamese', category: 'Soup', tags: 'noodles,beef,broth,star anise', image: T + 'pbzcrx1763765096.jpg' },
  { name: 'Banh Mi', nativeName: 'B\u00E1nh M\u00EC', cuisine: 'Vietnamese', category: 'Sandwich', tags: 'baguette,pork,pickled vegetables', image: T + 'z0ageb1583189517.jpg' },
  { name: 'Bun Cha', nativeName: 'B\u00FAn Ch\u1EA3', cuisine: 'Vietnamese', category: 'Noodles', tags: 'grilled pork,hanoi,dipping sauce', image: T + 'qqwypw1504642429.jpg' },
  { name: 'Bun Bo Hue', nativeName: 'B\u00FAn B\u00F2 Hu\u1EBF', cuisine: 'Vietnamese', category: 'Soup', tags: 'spicy,lemongrass,beef', image: '/img/bun-bo-hue.jpg' },

  // ═══ Japanese ═══
  { name: 'Ramen', nativeName: '\u30E9\u30FC\u30E1\u30F3', cuisine: 'Japanese', category: 'Soup', tags: 'noodles,broth,pork,egg', image: T + 'ip5xtp1769779958.jpg' },
  { name: 'Gyoza', nativeName: '\u9903\u5B50', cuisine: 'Japanese', category: 'Dumplings', tags: 'pan-fried,pork,dipping sauce', image: '/img/gyoza.jpg' },
  { name: 'Katsu Curry', nativeName: '\u30AB\u30C4\u30AB\u30EC\u30FC', cuisine: 'Japanese', category: 'Curry', tags: 'pork,breaded,rice', image: T + 'vwrpps1503068729.jpg' },
  { name: 'Okonomiyaki', nativeName: '\u304A\u597D\u307F\u713C\u304D', cuisine: 'Japanese', category: 'Pancake', tags: 'cabbage,osaka,savory', image: '/img/okonomiyaki.jpg' },
  { name: 'Yakitori', nativeName: '\u713C\u304D\u9CE5', cuisine: 'Japanese', category: 'Grilled', tags: 'chicken,skewers,tare', image: '/img/yakitori.jpg' },
  { name: 'Tonkotsu Ramen', nativeName: '\u8C5A\u9AA8\u30E9\u30FC\u30E1\u30F3', cuisine: 'Japanese', category: 'Soup', tags: 'pork bone,rich,noodles,egg', image: T + 'ip5xtp1769779958.jpg' },
  { name: 'Teriyaki Chicken', nativeName: '\u7167\u308A\u713C\u304D\u30C1\u30AD\u30F3', cuisine: 'Japanese', category: 'Grilled', tags: 'chicken,sweet,soy,rice', image: T + 'wvpsxx1468256321.jpg' },

  // ═══ Chinese ═══
  { name: 'Mapo Tofu', nativeName: '\u9EBB\u5A46\u8C46\u8150', cuisine: 'Chinese', category: 'Stir-fry', tags: 'tofu,sichuan,spicy,numbing', image: T + '1525874812.jpg' },
  { name: 'Dan Dan Noodles', nativeName: '\u62C5\u62C5\u9762', cuisine: 'Chinese', category: 'Noodles', tags: 'sichuan,peanuts,spicy', image: '/img/dan-dan-noodles.jpg' },
  { name: 'Char Siu', nativeName: '\u53C9\u70E7', cuisine: 'Chinese', category: 'Roast', tags: 'bbq pork,cantonese,honey', image: '/img/char-siu.jpg' },
  { name: 'Wonton Soup', nativeName: '\u9984\u997A\u6C64', cuisine: 'Chinese', category: 'Soup', tags: 'dumplings,broth,shrimp', image: T + '1525876468.jpg' },
  { name: 'Kung Pao Chicken', nativeName: '\u5BAB\u4FDD\u9E21\u4E01', cuisine: 'Chinese', category: 'Stir-fry', tags: 'sichuan,peanuts,spicy,chicken', image: T + '1525872624.jpg' },

  // ═══ Indian ═══
  { name: 'Biryani', nativeName: '\u092C\u093F\u0930\u092F\u093E\u0928\u0940', cuisine: 'Indian', category: 'Rice', tags: 'spiced,layered,saffron', image: T + 'xrttsx1487339558.jpg' },
  { name: 'Palak Paneer', nativeName: '\u092A\u093E\u0932\u0915 \u092A\u0928\u0940\u0930', cuisine: 'Indian', category: 'Curry', tags: 'spinach,vegetarian,cheese', image: T + 'xxpqsy1511452222.jpg' },
  { name: 'Dal Tadka', nativeName: '\u0926\u093E\u0932 \u0924\u0921\u093C\u0915\u093E', cuisine: 'Indian', category: 'Curry', tags: 'lentils,vegetarian,tempered', image: T + 'wuxrtu1483564410.jpg' },
  { name: 'Butter Chicken', nativeName: '\u092E\u0916\u093C\u0928\u0940 \u092E\u0941\u0930\u094D\u0917\u093C', cuisine: 'Indian', category: 'Curry', tags: 'creamy,tomato,tandoori', image: '/img/butter-chicken.jpg' },

  // ═══ Indonesian ═══
  { name: 'Nasi Goreng', nativeName: 'Nasi Goreng', cuisine: 'Indonesian', category: 'Fried Rice', tags: 'fried rice,shrimp paste,egg', image: '/img/nasi-goreng.jpg' },
];
