export interface Dish {
  name: string;
  cuisine: string;
  category: string;
  tags: string;
  image: string | null;
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
  { name: 'Green Curry', cuisine: 'Thai', category: 'Curry', tags: 'gaeng khiao wan,coconut,spicy,green chili,chicken', image: T + 'sstssx1487349585.jpg' },
  { name: 'Gaeng Khiao Wan', cuisine: 'Thai', category: 'Curry', tags: 'green curry,coconut,thai eggplant,basil', image: T + 'sstssx1487349585.jpg' },
  { name: 'Red Curry', cuisine: 'Thai', category: 'Curry', tags: 'gaeng phet,coconut,spicy,red chili,bamboo', image: '/img/red-curry.jpg' },
  { name: 'Yellow Curry', cuisine: 'Thai', category: 'Curry', tags: 'gaeng lueng,coconut,mild,turmeric,potato', image: '/img/yellow-curry.jpg' },
  { name: 'Massaman Curry', cuisine: 'Thai', category: 'Curry', tags: 'gaeng massaman,peanuts,mild,potato,cinnamon', image: T + 'tvttqv1504640475.jpg' },
  { name: 'Panang Curry', cuisine: 'Thai', category: 'Curry', tags: 'panaeng,thick,creamy,kaffir lime,peanut', image: T + '0dhtwr1763371444.jpg' },
  { name: 'Khao Soi', cuisine: 'Thai', category: 'Curry Noodles', tags: 'northern,chiang mai,coconut,egg noodles,crispy', image: T + '118oj61763423896.jpg' },
  { name: 'Gaeng Som', cuisine: 'Thai', category: 'Curry', tags: 'sour curry,southern,fish,turmeric,tamarind', image: '/img/gaeng-som.jpg' },
  { name: 'Gaeng Hung Lay', cuisine: 'Thai', category: 'Curry', tags: 'northern,pork belly,burmese,ginger,tamarind', image: '/img/gaeng-hung-lay.jpg' },
  { name: 'Gaeng Pa', cuisine: 'Thai', category: 'Curry', tags: 'jungle curry,spicy,no coconut,wild herbs,peppercorn', image: '/img/gaeng-pa.jpg' },
  { name: 'Gaeng Tai Pla', cuisine: 'Thai', category: 'Curry', tags: 'southern,fish organs,fermented,spicy,intense', image: '/img/gaeng-tai-pla.jpg' },
  { name: 'Gaeng Liang', cuisine: 'Thai', category: 'Curry', tags: 'mixed vegetable,shrimp paste,pepper,healthy,light', image: '/img/gaeng-liang.jpg' },
  { name: 'Chu Chee', cuisine: 'Thai', category: 'Curry', tags: 'thick curry,fish,kaffir lime,no soup,red curry paste', image: '/img/chu-chee.jpg' },
  { name: 'Gaeng Kari', cuisine: 'Thai', category: 'Curry', tags: 'yellow curry,mild,potato,onion,chicken', image: T + 'snmtd61763426568.jpg' },
  { name: 'Gaeng Jued', cuisine: 'Thai', category: 'Soup', tags: 'clear soup,tofu,glass noodles,mild,pork', image: '/img/gaeng-jued.jpg' },
  { name: 'Panaeng Neua', cuisine: 'Thai', category: 'Curry', tags: 'panang beef,thick,creamy,kaffir lime', image: '/img/panaeng-neua.jpg' },

  // ═══ THAI — Soups (ต้ม) ═══
  { name: 'Tom Yum Goong', cuisine: 'Thai', category: 'Soup', tags: 'tom yum,shrimp,spicy,sour,lemongrass,galangal', image: T + 'l50vz41763422681.jpg' },
  { name: 'Tom Yum Gai', cuisine: 'Thai', category: 'Soup', tags: 'tom yum,chicken,spicy,sour,lemongrass', image: '/img/tom-yum-gai.jpg' },
  { name: 'Tom Kha Gai', cuisine: 'Thai', category: 'Soup', tags: 'coconut,chicken,galangal,creamy,mushroom', image: T + 'ol2xxt1763582263.jpg' },
  { name: 'Khao Tom', cuisine: 'Thai', category: 'Soup', tags: 'rice soup,breakfast,pork,ginger,comfort food', image: '/img/khao-tom.jpg' },
  { name: 'Tom Saap', cuisine: 'Thai', category: 'Soup', tags: 'isaan,spicy,sour,pork ribs,northeastern', image: '/img/tom-saap.jpg' },
  { name: 'Tom Jued Woon Sen', cuisine: 'Thai', category: 'Soup', tags: 'clear soup,glass noodles,pork,mild', image: '/img/tom-jued-woon-sen.jpg' },

  // ═══ THAI — Noodles (ก๋วยเตี๋ยว) ═══
  { name: 'Pad Thai', cuisine: 'Thai', category: 'Noodles', tags: 'rice noodles,tamarind,peanuts,street food,shrimp,egg', image: T + 'rg9ze01763479093.jpg' },
  { name: 'Pad See Ew', cuisine: 'Thai', category: 'Noodles', tags: 'wide noodles,soy sauce,chinese broccoli,stir-fry', image: T + 'uuuspp1468263334.jpg' },
  { name: 'Pad Woon Sen', cuisine: 'Thai', category: 'Noodles', tags: 'glass noodles,stir-fry,egg,vegetables', image: '/img/pad-woon-sen.jpg' },
  { name: 'Drunken Noodles', cuisine: 'Thai', category: 'Noodles', tags: 'pad kee mao,spicy,basil,wide noodles,chili', image: T + '2wx8cm1763373419.jpg' },
  { name: 'Pad Kee Mao', cuisine: 'Thai', category: 'Noodles', tags: 'drunken noodles,spicy,basil,wide noodles', image: T + '2wx8cm1763373419.jpg' },
  { name: 'Guay Tiew', cuisine: 'Thai', category: 'Noodles', tags: 'noodle soup,street food,pork,beef,chicken,broth', image: '/img/guay-tiew.jpg' },
  { name: 'Guay Tiew Reua', cuisine: 'Thai', category: 'Noodles', tags: 'boat noodles,dark broth,pork blood,intense,street food', image: '/img/guay-tiew-reua.jpg' },
  { name: 'Kuay Chap', cuisine: 'Thai', category: 'Noodles', tags: 'rolled noodles,pork,five spice,offal,broth', image: '/img/kuay-chap.jpg' },
  { name: 'Yen Ta Fo', cuisine: 'Thai', category: 'Noodles', tags: 'pink noodles,fermented tofu,seafood,sweet,sour', image: '/img/yen-ta-fo.jpg' },
  { name: 'Bamee', cuisine: 'Thai', category: 'Noodles', tags: 'egg noodles,wonton,pork,roast duck', image: '/img/bamee.jpg' },
  { name: 'Rad Na', cuisine: 'Thai', category: 'Noodles', tags: 'gravy noodles,wide noodles,broccoli,pork,thick sauce', image: '/img/rad-na.jpg' },
  { name: 'Khanom Jeen', cuisine: 'Thai', category: 'Noodles', tags: 'rice noodles,curry,fermented,fish curry,green curry', image: '/img/khanom-jeen.jpg' },
  { name: 'Khanom Jeen Nam Ya', cuisine: 'Thai', category: 'Noodles', tags: 'rice noodles,fish curry,southern,spicy', image: '/img/khanom-jeen-nam-ya.jpg' },
  { name: 'Sukiyaki Thai', cuisine: 'Thai', category: 'Noodles', tags: 'glass noodles,hot pot,egg,sweet sauce,seafood', image: '/img/sukiyaki-thai.jpg' },
  { name: 'Mee Krob', cuisine: 'Thai', category: 'Noodles', tags: 'crispy noodles,sweet,tangy,shrimp,palm sugar', image: '/img/mee-krob.jpg' },

  // ═══ THAI — Stir-fries (ผัด) ═══
  { name: 'Pad Kra Pao', cuisine: 'Thai', category: 'Stir-fry', tags: 'holy basil,street food,chili,minced pork,fried egg', image: T + 'el64dy1763483009.jpg' },
  { name: 'Pad Prik King', cuisine: 'Thai', category: 'Stir-fry', tags: 'red curry paste,green beans,kaffir lime,dry curry', image: '/img/pad-prik-king.jpg' },
  { name: 'Pad Cashew Chicken', cuisine: 'Thai', category: 'Stir-fry', tags: 'gai pad met mamuang,cashew nuts,dried chili,sweet', image: '/img/pad-cashew-chicken.jpg' },
  { name: 'Pad Prik Gaeng', cuisine: 'Thai', category: 'Stir-fry', tags: 'curry paste stir-fry,pork,green beans,spicy', image: '/img/pad-prik-gaeng.jpg' },
  { name: 'Pad Phak Bung', cuisine: 'Thai', category: 'Stir-fry', tags: 'morning glory,fire wok,garlic,chili,street food', image: '/img/pad-phak-bung.jpg' },
  { name: 'Pad Phak Ruam', cuisine: 'Thai', category: 'Stir-fry', tags: 'mixed vegetables,oyster sauce,garlic,healthy', image: '/img/pad-phak-ruam.jpg' },
  { name: 'Kai Pad Prik', cuisine: 'Thai', category: 'Stir-fry', tags: 'chicken,chili,bell pepper,onion', image: '/img/kai-pad-prik.jpg' },
  { name: 'Neua Pad Prik', cuisine: 'Thai', category: 'Stir-fry', tags: 'beef,chili,basil,oyster sauce', image: '/img/neua-pad-prik.jpg' },
  { name: 'Pla Rad Prik', cuisine: 'Thai', category: 'Stir-fry', tags: 'fried fish,chili sauce,sweet,sour,crispy', image: '/img/pla-rad-prik.jpg' },

  // ═══ THAI — Rice dishes (ข้าว) ═══
  { name: 'Khao Pad', cuisine: 'Thai', category: 'Fried Rice', tags: 'fried rice,egg,quick,garlic,onion', image: T + 'hblwvg1763478203.jpg' },
  { name: 'Khao Pad Gai', cuisine: 'Thai', category: 'Fried Rice', tags: 'chicken fried rice,egg,garlic,soy sauce', image: '/img/khao-pad-gai.jpg' },
  { name: 'Khao Pad Goong', cuisine: 'Thai', category: 'Fried Rice', tags: 'shrimp fried rice,egg,garlic', image: '/img/khao-pad-goong.jpg' },
  { name: 'Khao Pad Sapparod', cuisine: 'Thai', category: 'Fried Rice', tags: 'pineapple fried rice,curry powder,raisins,cashews', image: '/img/khao-pad-sapparod.jpg' },
  { name: 'Khao Man Gai', cuisine: 'Thai', category: 'Rice', tags: 'chicken rice,hainanese,poached chicken,ginger sauce,street food', image: '/img/khao-man-gai.jpg' },
  { name: 'Khao Moo Daeng', cuisine: 'Thai', category: 'Rice', tags: 'red pork rice,bbq pork,sweet sauce,street food', image: '/img/khao-moo-daeng.jpg' },
  { name: 'Khao Kha Moo', cuisine: 'Thai', category: 'Rice', tags: 'braised pork leg,five spice,egg,pickled mustard,street food', image: '/img/khao-kha-moo.jpg' },
  { name: 'Khao Na Ped', cuisine: 'Thai', category: 'Rice', tags: 'roast duck rice,gravy,chinese-thai', image: '/img/khao-na-ped.jpg' },
  { name: 'Khao Mok Gai', cuisine: 'Thai', category: 'Rice', tags: 'thai biryani,chicken,turmeric,spiced rice,southern', image: '/img/khao-mok-gai.jpg' },
  { name: 'Khao Kluk Kapi', cuisine: 'Thai', category: 'Rice', tags: 'shrimp paste rice,sweet pork,green mango,dried shrimp', image: '/img/khao-kluk-kapi.jpg' },
  { name: 'Khao Niao', cuisine: 'Thai', category: 'Rice', tags: 'sticky rice,isaan,glutinous rice,northeastern', image: '/img/khao-niao.jpg' },

  // ═══ THAI — Salads (ยำ/ส้มตำ) ═══
  { name: 'Som Tam', cuisine: 'Thai', category: 'Salad', tags: 'papaya salad,spicy,northeastern,isaan,lime,chili', image: '/img/som-tam.jpg' },
  { name: 'Som Tam Thai', cuisine: 'Thai', category: 'Salad', tags: 'papaya salad,peanuts,dried shrimp,sweet', image: '/img/som-tam-thai.jpg' },
  { name: 'Som Tam Poo Pla Ra', cuisine: 'Thai', category: 'Salad', tags: 'papaya salad,fermented fish,crab,isaan,intense', image: '/img/som-tam-poo-pla-ra.jpg' },
  { name: 'Larb', cuisine: 'Thai', category: 'Salad', tags: 'minced meat,northeastern,isaan,lime,mint,toasted rice', image: '/img/larb.jpg' },
  { name: 'Larb Moo', cuisine: 'Thai', category: 'Salad', tags: 'minced pork,isaan,lime,chili,herbs', image: '/img/larb-moo.jpg' },
  { name: 'Larb Gai', cuisine: 'Thai', category: 'Salad', tags: 'minced chicken,isaan,lime,chili,herbs', image: '/img/larb-gai.jpg' },
  { name: 'Nam Tok', cuisine: 'Thai', category: 'Salad', tags: 'waterfall beef,grilled,northeastern,lime,toasted rice', image: '/img/nam-tok.jpg' },
  { name: 'Yam Woon Sen', cuisine: 'Thai', category: 'Salad', tags: 'glass noodle salad,shrimp,spicy,lime,herbs', image: '/img/yam-woon-sen.jpg' },
  { name: 'Yam Talay', cuisine: 'Thai', category: 'Salad', tags: 'seafood salad,spicy,lime,lemongrass,shrimp,squid', image: '/img/yam-talay.jpg' },
  { name: 'Yam Neua', cuisine: 'Thai', category: 'Salad', tags: 'beef salad,spicy,lime,onion,herbs', image: '/img/yam-neua.jpg' },
  { name: 'Yam Pla Dook Foo', cuisine: 'Thai', category: 'Salad', tags: 'crispy catfish,green mango,spicy,fluffy', image: '/img/yam-pla-dook-foo.jpg' },
  { name: 'Yam Mamuang', cuisine: 'Thai', category: 'Salad', tags: 'green mango salad,spicy,sweet,sour,cashew', image: '/img/yam-mamuang.jpg' },
  { name: 'Yam Khai Dao', cuisine: 'Thai', category: 'Salad', tags: 'fried egg salad,spicy,lime,onion', image: '/img/yam-khai-dao.jpg' },
  { name: 'Phla Goong', cuisine: 'Thai', category: 'Salad', tags: 'spicy shrimp salad,lemongrass,lime,herbs', image: '/img/phla-goong.jpg' },

  // ═══ THAI — Grilled (ย่าง/ปิ้ง) ═══
  { name: 'Gai Yang', cuisine: 'Thai', category: 'Grilled', tags: 'grilled chicken,northeastern,isaan,street food,sticky rice', image: T + 'ittake1763586925.jpg' },
  { name: 'Moo Ping', cuisine: 'Thai', category: 'Grilled', tags: 'grilled pork skewers,street food,sticky rice,sweet marinade', image: '/img/moo-ping.jpg' },
  { name: 'Satay', cuisine: 'Thai', category: 'Grilled', tags: 'chicken satay,peanut sauce,skewers,turmeric,cucumber relish', image: '/img/satay.jpg' },
  { name: 'Kor Moo Yang', cuisine: 'Thai', category: 'Grilled', tags: 'grilled pork neck,isaan,spicy dipping sauce,nam jim jaew', image: '/img/kor-moo-yang.jpg' },
  { name: 'Pla Pao', cuisine: 'Thai', category: 'Grilled', tags: 'salt-crusted grilled fish,lemongrass,whole fish,street food', image: '/img/pla-pao.jpg' },
  { name: 'Sai Krok Isaan', cuisine: 'Thai', category: 'Grilled', tags: 'fermented sausage,northeastern,sour,rice,pork', image: '/img/sai-krok-isaan.jpg' },
  { name: 'Suea Rong Hai', cuisine: 'Thai', category: 'Grilled', tags: 'crying tiger,grilled beef,spicy dipping sauce,isaan', image: '/img/suea-rong-hai.jpg' },
  { name: 'Moo Satay', cuisine: 'Thai', category: 'Grilled', tags: 'pork satay,peanut sauce,skewers,turmeric', image: '/img/moo-satay.jpg' },

  // ═══ THAI — Fried & Street Food (ทอด) ═══
  { name: 'Tod Mun Pla', cuisine: 'Thai', category: 'Appetizer', tags: 'fish cakes,curry paste,fried,kaffir lime,green beans', image: T + '6s3i3p1763488540.jpg' },
  { name: 'Kai Jeow', cuisine: 'Thai', category: 'Omelette', tags: 'thai omelette,egg,street food,quick,fish sauce', image: '/img/kai-jeow.jpg' },
  { name: 'Kai Jeow Moo Sap', cuisine: 'Thai', category: 'Omelette', tags: 'omelette,minced pork,street food', image: '/img/kai-jeow-moo-sap.jpg' },
  { name: 'Gai Tod', cuisine: 'Thai', category: 'Fried', tags: 'thai fried chicken,garlic,fish sauce,crispy,street food', image: '/img/gai-tod.jpg' },
  { name: 'Gai Tod Hat Yai', cuisine: 'Thai', category: 'Fried', tags: 'hat yai fried chicken,southern,turmeric,crispy shallots', image: '/img/gai-tod-hat-yai.jpg' },
  { name: 'Moo Tod Gratiem', cuisine: 'Thai', category: 'Fried', tags: 'fried pork,garlic,pepper,street food', image: '/img/moo-tod-gratiem.jpg' },
  { name: 'Poh Pia Tod', cuisine: 'Thai', category: 'Appetizer', tags: 'spring rolls,fried,crispy,pork,vegetables', image: '/img/poh-pia-tod.jpg' },
  { name: 'Poh Pia Sod', cuisine: 'Thai', category: 'Appetizer', tags: 'fresh spring rolls,rice paper,shrimp,herbs,no fry', image: '/img/poh-pia-sod.jpg' },
  { name: 'Hoy Tod', cuisine: 'Thai', category: 'Street Food', tags: 'crispy mussel omelette,egg,starch,bean sprouts', image: '/img/hoy-tod.jpg' },
  { name: 'Look Chin', cuisine: 'Thai', category: 'Street Food', tags: 'meatballs,fish balls,pork balls,skewers,street food', image: '/img/look-chin.jpg' },
  { name: 'Khanom Buang', cuisine: 'Thai', category: 'Street Food', tags: 'thai crepes,crispy,sweet,meringue,coconut', image: '/img/khanom-buang.jpg' },
  { name: 'Goong Sarong', cuisine: 'Thai', category: 'Appetizer', tags: 'shrimp wrapped in noodles,deep fried,crispy', image: '/img/goong-sarong.jpg' },
  { name: 'Thot Man Khao Pod', cuisine: 'Thai', category: 'Appetizer', tags: 'corn cakes,fried,curry paste,sweet corn', image: '/img/thot-man-khao-pod.jpg' },

  // ═══ THAI — Dips & Sauces (น้ำพริก) ═══
  { name: 'Nam Prik Ong', cuisine: 'Thai', category: 'Dip', tags: 'northern,tomato chili dip,pork,served with vegetables', image: '/img/nam-prik-ong.jpg' },
  { name: 'Nam Prik Noom', cuisine: 'Thai', category: 'Dip', tags: 'northern,green chili dip,roasted,smoky', image: '/img/nam-prik-noom.jpg' },
  { name: 'Nam Jim Jaew', cuisine: 'Thai', category: 'Dip', tags: 'isaan dipping sauce,chili,lime,toasted rice,fish sauce', image: '/img/nam-jim-jaew.jpg' },
  { name: 'Nam Prik Goong Siap', cuisine: 'Thai', category: 'Dip', tags: 'dried shrimp dip,southern,spicy', image: '/img/nam-prik-goong-siap.jpg' },
  { name: 'Nam Prik Kapi', cuisine: 'Thai', category: 'Dip', tags: 'shrimp paste dip,chili,lime,served with fried mackerel', image: '/img/nam-prik-kapi.jpg' },
  { name: 'Lon Tao Jiaw', cuisine: 'Thai', category: 'Dip', tags: 'soybean dip,coconut milk,sweet,mild', image: '/img/lon-tao-jiaw.jpg' },

  // ═══ THAI — Other mains ═══
  { name: 'Kai Palo', cuisine: 'Thai', category: 'Braised', tags: 'five spice eggs,pork,tofu,chinese-thai,star anise', image: '/img/kai-palo.jpg' },
  { name: 'Moo Hong', cuisine: 'Thai', category: 'Braised', tags: 'southern braised pork,pepper,garlic,palm sugar,slow cooked', image: '/img/moo-hong.jpg' },
  { name: 'Pla Nueng Manao', cuisine: 'Thai', category: 'Steamed', tags: 'steamed fish,lime,chili,garlic,sour,spicy', image: '/img/pla-nueng-manao.jpg' },
  { name: 'Pla Sam Rod', cuisine: 'Thai', category: 'Fried', tags: 'three flavored fish,sweet,sour,spicy,crispy', image: '/img/pla-sam-rod.jpg' },
  { name: 'Neua Toon', cuisine: 'Thai', category: 'Braised', tags: 'braised beef,five spice,slow cooked,noodle soup', image: '/img/neua-toon.jpg' },
  { name: 'Ho Mok', cuisine: 'Thai', category: 'Steamed', tags: 'fish curry custard,banana leaf,coconut,steamed', image: '/img/ho-mok.jpg' },
  { name: 'Pla Meuk Yang', cuisine: 'Thai', category: 'Grilled', tags: 'grilled squid,seafood,street food,dipping sauce', image: '/img/pla-meuk-yang.jpg' },

  // ═══ THAI — Desserts (ขนม) ═══
  { name: 'Kao Niao Mamuang', cuisine: 'Thai', category: 'Dessert', tags: 'mango sticky rice,coconut milk,sweet,iconic', image: '/img/kao-niao-mamuang.jpg' },
  { name: 'Tub Tim Grob', cuisine: 'Thai', category: 'Dessert', tags: 'water chestnuts,red,coconut milk,ice,crunchy', image: '/img/tub-tim-grob.jpg' },
  { name: 'Bua Loi', cuisine: 'Thai', category: 'Dessert', tags: 'rice balls,coconut cream,warm,sweet,taro,pandan', image: '/img/bua-loi.jpg' },
  { name: 'Khanom Krok', cuisine: 'Thai', category: 'Dessert', tags: 'coconut pancakes,crispy,sweet,street food,pandan', image: '/img/khanom-krok.jpg' },
  { name: 'Sangkaya Fak Thong', cuisine: 'Thai', category: 'Dessert', tags: 'pumpkin custard,coconut,egg,steamed,sweet', image: '/img/sangkaya-fak-thong.jpg' },
  { name: 'Lod Chong', cuisine: 'Thai', category: 'Dessert', tags: 'pandan noodles,coconut milk,palm sugar,green,iced', image: '/img/lod-chong.jpg' },
  { name: 'Foi Thong', cuisine: 'Thai', category: 'Dessert', tags: 'golden threads,egg yolk,sugar syrup,portuguese origin', image: '/img/foi-thong.jpg' },
  { name: 'Kluay Buat Chi', cuisine: 'Thai', category: 'Dessert', tags: 'bananas in coconut milk,warm,sweet,simple', image: '/img/kluay-buat-chi.jpg' },
  { name: 'Khanom Tuay', cuisine: 'Thai', category: 'Dessert', tags: 'coconut custard cups,pandan,two layers,steamed', image: '/img/khanom-tuay.jpg' },
  { name: 'Itim Kati', cuisine: 'Thai', category: 'Dessert', tags: 'coconut ice cream,street food,toppings,peanuts,sweet corn', image: '/img/itim-kati.jpg' },
  { name: 'Khanom Tan', cuisine: 'Thai', category: 'Dessert', tags: 'palm sugar cakes,steamed,fluffy,traditional', image: '/img/khanom-tan.jpg' },
  { name: 'Khao Lam', cuisine: 'Thai', category: 'Dessert', tags: 'bamboo sticky rice,coconut,sweet,grilled,black beans', image: '/img/khao-lam.jpg' },
  { name: 'Roti', cuisine: 'Thai', category: 'Dessert', tags: 'thai roti,street food,banana,egg,condensed milk,crispy', image: '/img/roti.jpg' },

  // ═══ Korean ═══
  { name: 'Bibimbap', cuisine: 'Korean', category: 'Rice Bowl', tags: 'vegetables,gochujang,egg', image: '/img/bibimbap.jpg' },
  { name: 'Kimchi Jjigae', cuisine: 'Korean', category: 'Stew', tags: 'kimchi,tofu,pork', image: '/img/kimchi-jjigae.jpg' },
  { name: 'Bulgogi', cuisine: 'Korean', category: 'Grilled', tags: 'beef,marinated,sesame', image: '/img/bulgogi.jpg' },
  { name: 'Japchae', cuisine: 'Korean', category: 'Noodles', tags: 'glass noodles,sweet,vegetables', image: '/img/japchae.jpg' },
  { name: 'Tteokbokki', cuisine: 'Korean', category: 'Street Food', tags: 'rice cakes,spicy,gochujang', image: '/img/tteokbokki.jpg' },
  { name: 'Korean Fried Chicken', cuisine: 'Korean', category: 'Fried', tags: 'chicken,crispy,gochujang', image: '/img/korean-fried-chicken.jpg' },
  { name: 'Sundubu Jjigae', cuisine: 'Korean', category: 'Stew', tags: 'soft tofu,spicy,egg', image: '/img/sundubu-jjigae.jpg' },

  // ═══ Vietnamese ═══
  { name: 'Pho', cuisine: 'Vietnamese', category: 'Soup', tags: 'noodles,beef,broth,star anise', image: T + 'pbzcrx1763765096.jpg' },
  { name: 'Banh Mi', cuisine: 'Vietnamese', category: 'Sandwich', tags: 'baguette,pork,pickled vegetables', image: T + 'z0ageb1583189517.jpg' },
  { name: 'Bun Cha', cuisine: 'Vietnamese', category: 'Noodles', tags: 'grilled pork,hanoi,dipping sauce', image: T + 'qqwypw1504642429.jpg' },
  { name: 'Bun Bo Hue', cuisine: 'Vietnamese', category: 'Soup', tags: 'spicy,lemongrass,beef', image: '/img/bun-bo-hue.jpg' },

  // ═══ Japanese ═══
  { name: 'Ramen', cuisine: 'Japanese', category: 'Soup', tags: 'noodles,broth,pork,egg', image: T + 'ip5xtp1769779958.jpg' },
  { name: 'Gyoza', cuisine: 'Japanese', category: 'Dumplings', tags: 'pan-fried,pork,dipping sauce', image: '/img/gyoza.jpg' },
  { name: 'Katsu Curry', cuisine: 'Japanese', category: 'Curry', tags: 'pork,breaded,rice', image: T + 'vwrpps1503068729.jpg' },
  { name: 'Okonomiyaki', cuisine: 'Japanese', category: 'Pancake', tags: 'cabbage,osaka,savory', image: '/img/okonomiyaki.jpg' },
  { name: 'Yakitori', cuisine: 'Japanese', category: 'Grilled', tags: 'chicken,skewers,tare', image: '/img/yakitori.jpg' },
  { name: 'Tonkotsu Ramen', cuisine: 'Japanese', category: 'Soup', tags: 'pork bone,rich,noodles,egg', image: T + 'ip5xtp1769779958.jpg' },
  { name: 'Teriyaki Chicken', cuisine: 'Japanese', category: 'Grilled', tags: 'chicken,sweet,soy,rice', image: T + 'wvpsxx1468256321.jpg' },

  // ═══ Chinese ═══
  { name: 'Mapo Tofu', cuisine: 'Chinese', category: 'Stir-fry', tags: 'tofu,sichuan,spicy,numbing', image: T + '1525874812.jpg' },
  { name: 'Dan Dan Noodles', cuisine: 'Chinese', category: 'Noodles', tags: 'sichuan,peanuts,spicy', image: '/img/dan-dan-noodles.jpg' },
  { name: 'Char Siu', cuisine: 'Chinese', category: 'Roast', tags: 'bbq pork,cantonese,honey', image: '/img/char-siu.jpg' },
  { name: 'Wonton Soup', cuisine: 'Chinese', category: 'Soup', tags: 'dumplings,broth,shrimp', image: T + '1525876468.jpg' },
  { name: 'Kung Pao Chicken', cuisine: 'Chinese', category: 'Stir-fry', tags: 'sichuan,peanuts,spicy,chicken', image: T + '1525872624.jpg' },

  // ═══ Indian ═══
  { name: 'Biryani', cuisine: 'Indian', category: 'Rice', tags: 'spiced,layered,saffron', image: T + 'xrttsx1487339558.jpg' },
  { name: 'Palak Paneer', cuisine: 'Indian', category: 'Curry', tags: 'spinach,vegetarian,cheese', image: T + 'xxpqsy1511452222.jpg' },
  { name: 'Dal Tadka', cuisine: 'Indian', category: 'Curry', tags: 'lentils,vegetarian,tempered', image: T + 'wuxrtu1483564410.jpg' },
  { name: 'Butter Chicken', cuisine: 'Indian', category: 'Curry', tags: 'creamy,tomato,tandoori', image: '/img/butter-chicken.jpg' },

  // ═══ Indonesian ═══
  { name: 'Nasi Goreng', cuisine: 'Indonesian', category: 'Fried Rice', tags: 'fried rice,shrimp paste,egg', image: '/img/nasi-goreng.jpg' },
];
